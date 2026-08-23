// Оркестратор голубой шахматки. Приводит нашу шахматку к зеркалу чужого
// календаря. Два вида источника:
//  • Shelter (по категориям): наши брони упаковываются вниз по строкам-номерам
//    (ДАТЫ не меняются, только room_id), затем «занято N из M» дописывается
//    метками на свободные номера (external_source='mirror_shelter');
//  • Google-таблица (по-номерно): зеркалим занятость на конкретные номера,
//    перестановка не нужна; метки external_source=<tag источника>.

import type { SupabaseClient } from '@supabase/supabase-js';

import { deleteCacheByPrefix } from '@/app/api/yandex-backend/_lib/memoryCache';

import { computeMirrorMarkers, type OurReserve } from './computeMirrorReserves';
import { NIGHT, readGoogleSheetOccupancy, type GoogleSheetSource } from './googleSheet';
import {
    detectSalesHorizon,
    fetchKonturRooms,
    readKonturOccupancy,
} from './konturBookonline';
import {
    getMirrorSource,
    type IcalMirrorSource,
    type KonturMirrorSource,
    type ShelterMirrorSource,
} from './mirrorSources';
import { readIcalOccupancy } from './reservationstepsIcal';
import { computePullDownRepack, type RepackBooking, type RepackMove } from './repackBookings';
import { readShelterOccupancy } from './shelterFrontdesk';
import {
    getIcalSyncSafetyError,
    getTransactionalIcalMinRetainedRatio,
    isLargeIcalDecreaseConfirmed,
    isTransactionalIcalSyncEnabled,
    parseExternalOccupancySummary,
    toExternalOccupancyMarks,
    type IcalSyncMarker,
} from './transactionalIcalSync';

const MIRROR_SOURCE_TAG = 'mirror_shelter';
const DEFAULT_GUEST = 'Занято (внешний календарь)';

export type MirrorSyncResult = {
    hotelId: string;
    dryRun: boolean;
    roomsTotal: number;
    ourReserves: number;
    movedBookings: number;
    markersPlanned: number;
    inserted: number;
    skipped: number;
    moves?: RepackMove[];
    markers?: Array<{ roomId: string; start: number; end: number }>;
};

type ReserveRow = {
    id: string;
    room_id: string;
    start: number;
    end: number;
    external_source: string | null;
};

export const syncMirrorForHotel = async (
    supabase: SupabaseClient,
    hotelId: string,
    options: { dryRun?: boolean; horizonDays?: number } = {},
): Promise<MirrorSyncResult> => {
    const source = getMirrorSource(hotelId);
    if (!source) {
        throw new Error('Для этого отеля не настроено зеркало занятости');
    }
    if (source.system === 'googlesheet') {
        return syncGoogleSheet(supabase, hotelId, source, options);
    }
    if (source.system === 'ical') {
        return syncIcal(supabase, hotelId, source, options);
    }
    if (source.system === 'kontur') {
        return syncKontur(supabase, hotelId, source, options);
    }
    return syncShelter(supabase, hotelId, source, options);
};

// ---------------------------------------------------------------------------
// Контур/bookonline24: по-номерно. Занято = 0 свободных на ночь В ПРЕДЕЛАХ
// горизонта продаж (за горизонтом ноль означает «продажи не открыты»).
// ---------------------------------------------------------------------------
const syncKontur = async (
    supabase: SupabaseClient,
    hotelId: string,
    source: KonturMirrorSource,
    options: { dryRun?: boolean },
): Promise<MirrorSyncResult> => {
    const dryRun = options.dryRun === true;

    const { data: roomRows, error: roomsError } = await supabase
        .from('rooms')
        .select('id, title, is_service')
        .eq('hotel_id', hotelId);
    if (roomsError) {
        throw new Error(roomsError.message);
    }
    const ourRooms = ((roomRows ?? []) as Array<{
        id: string;
        title: string | null;
        is_service: boolean | null;
    }>).filter((room) => !room.is_service);

    // категория Контура → наш room_id
    const roomIdByCategory = new Map<string, string>();
    for (const mapping of source.rooms) {
        const match = ourRooms.find(
            (room) =>
                room.title === mapping.titlePrefix ||
                (room.title ?? '').startsWith(`${mapping.titlePrefix} `) ||
                (room.title ?? '').startsWith(mapping.titlePrefix),
        );
        if (match) roomIdByCategory.set(mapping.categoryId, match.id);
    }
    const allRoomIds = [...roomIdByCategory.values()];
    if (allRoomIds.length === 0) {
        throw new Error('Не найдены номера отеля для источника Контур');
    }

    // горизонт продаж (иначе «нет цен» превратится в фальшивую занятость)
    const probeId = source.rooms[0].categoryId;
    const horizonDays = await detectSalesHorizon(source.slug, probeId);
    if (horizonDays === 0) {
        // объект не продаётся онлайн — ничего не помечаем
        return {
            hotelId,
            dryRun,
            roomsTotal: allRoomIds.length,
            ourReserves: 0,
            movedBookings: 0,
            markersPlanned: 0,
            inserted: 0,
            skipped: 0,
        };
    }

    const konturRooms = await fetchKonturRooms(source.slug);
    const wanted = konturRooms.filter((room) => roomIdByCategory.has(room.id));
    const occupancy = await readKonturOccupancy(source.slug, wanted, horizonDays);

    // наши брони — их не перекрываем
    const { data: rows, error } = await supabase
        .from('reserves')
        .select('id, room_id, start, end, external_source')
        .in('room_id', allRoomIds);
    if (error) {
        throw new Error(error.message);
    }
    const ourRows = ((rows ?? []) as ReserveRow[]).filter((row) => row.external_source !== source.tag);
    const ourNights = new Map<string, Set<number>>();
    for (const row of ourRows) {
        let nights = ourNights.get(row.room_id);
        if (!nights) {
            nights = new Set();
            ourNights.set(row.room_id, nights);
        }
        for (let n = Math.floor(row.start / NIGHT); n < Math.floor(row.end / NIGHT); n += 1) nights.add(n);
    }

    // склеиваем занятые ночи в интервалы
    const checkinUnix = (date: Date) =>
        Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 11) / 1000);
    const checkoutUnix = (date: Date) =>
        Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 9) / 1000);

    const markers: Array<{ roomId: string; start: number; end: number }> = [];
    let skipped = 0;
    for (const item of occupancy) {
        const roomId = roomIdByCategory.get(item.roomId);
        if (!roomId) continue;
        const days = item.busyNights.map((day) => new Date(`${day}T00:00:00Z`)).sort((a, b) => a.getTime() - b.getTime());
        let index = 0;
        while (index < days.length) {
            let last = index;
            while (
                last + 1 < days.length &&
                days[last + 1].getTime() - days[last].getTime() === 86_400_000
            ) {
                last += 1;
            }
            const start = checkinUnix(days[index]);
            const end = checkoutUnix(new Date(days[last].getTime() + 86_400_000));
            const ours = ourNights.get(roomId);
            let clash = false;
            if (ours) {
                for (let n = Math.floor(start / NIGHT); n < Math.floor(end / NIGHT); n += 1) {
                    if (ours.has(n)) {
                        clash = true;
                        break;
                    }
                }
            }
            if (clash) skipped += 1;
            else markers.push({ roomId, start, end });
            index = last + 1;
        }
    }

    if (dryRun) {
        return {
            hotelId,
            dryRun: true,
            roomsTotal: allRoomIds.length,
            ourReserves: ourRows.length,
            movedBookings: 0,
            markersPlanned: markers.length,
            inserted: 0,
            skipped,
            markers,
        };
    }

    const syncedAt = new Date().toISOString();
    const { error: deleteError } = await supabase
        .from('reserves')
        .delete()
        .eq('external_source', source.tag)
        .in('room_id', allRoomIds);
    if (deleteError) {
        throw new Error(deleteError.message);
    }

    let inserted = 0;
    for (const marker of markers) {
        const { error: insertError } = await supabase.from('reserves').insert({
            room_id: marker.roomId,
            start: marker.start,
            end: marker.end,
            guest: source.guest,
            phone: '',
            price: 0,
            quantity: 1,
            comment: 'Занятость из модуля бронирования отельера (зеркало)',
            created_by: source.tag,
            edited_at: syncedAt,
            edited_by: source.tag,
            external_source: source.tag,
            external_uid: `${source.tag}:${marker.roomId}:${marker.start}-${marker.end}`,
            external_feed_url: `https://${source.slug}.bookonline24.ru/`,
            external_synced_at: syncedAt,
        });
        if (!insertError) {
            inserted += 1;
        } else if (insertError.code === '23P01' || insertError.message?.includes('Наложение')) {
            skipped += 1;
        } else {
            throw new Error(insertError.message);
        }
    }

    deleteCacheByPrefix('hotel-calendar:');

    return {
        hotelId,
        dryRun: false,
        roomsTotal: allRoomIds.length,
        ourReserves: ourRows.length,
        movedBookings: 0,
        markersPlanned: markers.length,
        inserted,
        skipped,
    };
};

// ---------------------------------------------------------------------------
// Публичный iCal reservationsteps: по категориям, без перестановки.
// Событие фида = «в категории нет свободных» → метки на ВСЕ её строки,
// кроме тех, где на эти ночи уже стоит наша бронь.
// ---------------------------------------------------------------------------
const syncIcal = async (
    supabase: SupabaseClient,
    hotelId: string,
    source: IcalMirrorSource,
    options: { dryRun?: boolean; horizonDays?: number },
): Promise<MirrorSyncResult> => {
    const dryRun = options.dryRun === true;

    const { data: roomRows, error: roomsError } = await supabase
        .from('rooms')
        .select('id, title, is_service')
        .eq('hotel_id', hotelId);
    if (roomsError) {
        throw new Error(roomsError.message);
    }
    const rooms = ((roomRows ?? []) as Array<{
        id: string;
        title: string | null;
        is_service: boolean | null;
    }>).filter((room) => !room.is_service);

    const roomIdsByCategory = new Map<number, string[]>();
    for (const category of source.categories) {
        const matched = rooms.filter((room) => {
            const title = room.title ?? '';
            if (category.roomNumbers) {
                // номер комнаты внутри названия: «полулюкс 203 вид на …»
                const match = /\b(\d{2,4})\b/.exec(title);
                return match !== null && category.roomNumbers.includes(match[1]);
            }
            return (
                title === category.titlePrefix ||
                title.startsWith(`${category.titlePrefix} `)
            );
        });
        roomIdsByCategory.set(category.icalId, matched.map((room) => room.id));
    }
    const allRoomIds = [...roomIdsByCategory.values()].flat();
    if (allRoomIds.length === 0) {
        throw new Error('Не найдены номера отеля для категорий источника');
    }

    const occupancyResult = await readIcalOccupancy(
        source.categories,
        options.horizonDays ?? 365,
    );
    const occupancy = occupancyResult.categories;

    const { data: rows, error } = await supabase
        .from('reserves')
        .select('id, room_id, start, end, external_source')
        .in('room_id', allRoomIds);
    if (error) {
        throw new Error(error.message);
    }
    const ourRows = ((rows ?? []) as ReserveRow[]).filter((row) => row.external_source !== source.tag);
    const existingSourceCount = ((rows ?? []) as ReserveRow[]).filter(
        (row) => row.external_source === source.tag,
    ).length;
    const ourNights = new Map<string, Set<number>>();
    for (const row of ourRows) {
        let nights = ourNights.get(row.room_id);
        if (!nights) {
            nights = new Set();
            ourNights.set(row.room_id, nights);
        }
        for (let n = Math.floor(row.start / NIGHT); n < Math.floor(row.end / NIGHT); n += 1) {
            nights.add(n);
        }
    }

    const markers: IcalSyncMarker[] = [];
    let skipped = 0;
    for (const category of occupancy) {
        const roomIds = roomIdsByCategory.get(category.icalId) ?? [];
        for (const interval of category.intervals) {
            for (const roomId of roomIds) {
                const ours = ourNights.get(roomId);
                let clash = false;
                if (ours) {
                    for (let n = Math.floor(interval.start / NIGHT); n < Math.floor(interval.end / NIGHT); n += 1) {
                        if (ours.has(n)) {
                            clash = true;
                            break;
                        }
                    }
                }
                if (clash) {
                    skipped += 1;
                    continue;
                }
                markers.push({ roomId, start: interval.start, end: interval.end, icalId: category.icalId });
            }
        }
    }

    const minRetainedRatio = getTransactionalIcalMinRetainedRatio();
    const confirmLargeDecrease = isLargeIcalDecreaseConfirmed();
    const safetyError = getIcalSyncSafetyError({
        sourceComplete: occupancyResult.sourceComplete,
        confirmedEmpty: occupancyResult.confirmedEmpty,
        existingCount: existingSourceCount,
        proposedCount: markers.length,
        minRetainedRatio,
        confirmLargeDecrease,
    });

    if (dryRun) {
        if (safetyError) throw new Error(safetyError);
        return {
            hotelId,
            dryRun: true,
            roomsTotal: allRoomIds.length,
            ourReserves: ourRows.length,
            movedBookings: 0,
            markersPlanned: markers.length,
            inserted: 0,
            skipped,
            markers: markers.map(({ roomId, start, end }) => ({ roomId, start, end })),
        };
    }

    let inserted = 0;
    if (isTransactionalIcalSyncEnabled()) {
        const { data, error: rpcError } = await supabase.rpc('sync_external_occupancy', {
            p_source: source.tag,
            p_room_ids: allRoomIds,
            p_marks: toExternalOccupancyMarks(
                markers,
                source,
                'Категория продана целиком (зеркало, iCal)',
            ),
            p_source_complete: occupancyResult.sourceComplete,
            p_confirm_empty: occupancyResult.confirmedEmpty,
            p_min_retained_ratio: minRetainedRatio,
            p_confirm_large_decrease: confirmLargeDecrease,
        });
        if (rpcError) {
            throw new Error(rpcError.message);
        }
        const summary = parseExternalOccupancySummary(data);
        inserted = summary.inserted;
        skipped += summary.skippedManual;
    } else {
        if (safetyError) {
            const { error: logError } = await supabase.from('sync_runs').insert({
                source: source.tag,
                hotel_id: hotelId,
                finished_at: new Date().toISOString(),
                status: 'error',
                counts: {
                    existing: existingSourceCount,
                    proposed: markers.length,
                    retained_ratio:
                        existingSourceCount > 0 ? markers.length / existingSourceCount : null,
                    min_retained_ratio: minRetainedRatio,
                    source_complete: occupancyResult.sourceComplete,
                    confirmed_empty: occupancyResult.confirmedEmpty,
                    confirmed_large_decrease: confirmLargeDecrease,
                    legacy_path: true,
                },
                error: safetyError,
            });
            if (logError) {
                throw new Error(`${safetyError}. Не удалось записать ошибку в sync_runs`);
            }
            throw new Error(safetyError);
        }
        const syncedAt = new Date().toISOString();
        const { error: deleteError } = await supabase
            .from('reserves')
            .delete()
            .eq('external_source', source.tag)
            .in('room_id', allRoomIds);
        if (deleteError) {
            throw new Error(deleteError.message);
        }

        for (const marker of markers) {
            const { error: insertError } = await supabase.from('reserves').insert({
                room_id: marker.roomId,
                start: marker.start,
                end: marker.end,
                guest: source.guest,
                phone: '',
                price: 0,
                quantity: 1,
                comment: 'Категория продана целиком (зеркало, iCal)',
                created_by: source.tag,
                edited_at: syncedAt,
                edited_by: source.tag,
                external_source: source.tag,
                external_uid: `${source.tag}:${marker.roomId}:${marker.start}-${marker.end}`,
                external_feed_url: `https://public-api.reservationsteps.ru/v1/api/ical/${marker.icalId}`,
                external_synced_at: syncedAt,
            });
            if (!insertError) {
                inserted += 1;
            } else if (insertError.code === '23P01' || insertError.message?.includes('Наложение')) {
                skipped += 1;
            } else {
                throw new Error(insertError.message);
            }
        }
    }

    deleteCacheByPrefix('hotel-calendar:');

    return {
        hotelId,
        dryRun: false,
        roomsTotal: allRoomIds.length,
        ourReserves: ourRows.length,
        movedBookings: 0,
        markersPlanned: markers.length,
        inserted,
        skipped,
    };
};

// ---------------------------------------------------------------------------
// Google-таблица: по-номерно, без перестановки.
// ---------------------------------------------------------------------------
const syncGoogleSheet = async (
    supabase: SupabaseClient,
    hotelId: string,
    source: GoogleSheetSource,
    options: { dryRun?: boolean },
): Promise<MirrorSyncResult> => {
    const dryRun = options.dryRun === true;

    // 1. Наши номера отеля: номер (из названия) → room_id.
    const { data: roomRows, error: roomsError } = await supabase
        .from('rooms')
        .select('id, title, is_service')
        .eq('hotel_id', hotelId);
    if (roomsError) {
        throw new Error(roomsError.message);
    }
    const numToRoomId = new Map<number, string>();
    const roomRe = new RegExp(source.roomTitleRegex, 'i');
    for (const room of (roomRows ?? []) as Array<{
        id: string;
        title: string | null;
        is_service: boolean | null;
    }>) {
        if (room.is_service) continue;
        const match = roomRe.exec(room.title ?? '');
        if (match) numToRoomId.set(Number(match[1]), room.id);
    }
    const roomIds = [...numToRoomId.values()];

    // 2. Занятость из таблицы (по-номерно).
    const stays = await readGoogleSheetOccupancy(source);

    // 3. Наши брони на этих номерах (кроме наших же меток этого источника).
    const { data: rows, error } = await supabase
        .from('reserves')
        .select('id, room_id, start, end, external_source')
        .in('room_id', roomIds);
    if (error) {
        throw new Error(error.message);
    }
    const ourRows = ((rows ?? []) as ReserveRow[]).filter((row) => row.external_source !== source.tag);
    const ourNights = new Map<string, Set<number>>();
    for (const row of ourRows) {
        let set = ourNights.get(row.room_id);
        if (!set) {
            set = new Set();
            ourNights.set(row.room_id, set);
        }
        for (let n = Math.floor(row.start / NIGHT); n < Math.floor(row.end / NIGHT); n += 1) set.add(n);
    }

    // 4. Метки: занятость с таблицы, пропуская пересечения с нашими бронями (А1).
    const markers: Array<{ roomId: string; start: number; end: number }> = [];
    let skipped = 0;
    for (const stay of stays) {
        const roomId = numToRoomId.get(stay.roomNumber);
        if (!roomId) continue;
        const nights: number[] = [];
        for (let n = Math.floor(stay.start / NIGHT); n < Math.floor(stay.end / NIGHT); n += 1) nights.push(n);
        const our = ourNights.get(roomId);
        if (our && nights.some((n) => our.has(n))) {
            skipped += 1;
            continue;
        }
        markers.push({ roomId, start: stay.start, end: stay.end });
    }

    if (dryRun) {
        return {
            hotelId,
            dryRun: true,
            roomsTotal: roomIds.length,
            ourReserves: ourRows.length,
            movedBookings: 0,
            markersPlanned: markers.length,
            inserted: 0,
            skipped,
            markers,
        };
    }

    const syncedAt = new Date().toISOString();
    const { error: deleteError } = await supabase
        .from('reserves')
        .delete()
        .eq('external_source', source.tag)
        .in('room_id', roomIds);
    if (deleteError) {
        throw new Error(deleteError.message);
    }

    let inserted = 0;
    for (const marker of markers) {
        const { error: insertError } = await supabase.from('reserves').insert({
            room_id: marker.roomId,
            start: marker.start,
            end: marker.end,
            guest: source.guest,
            phone: '',
            price: 0,
            quantity: 1,
            comment: 'Занятость из таблицы отельера (зеркало)',
            created_by: source.tag,
            edited_at: syncedAt,
            edited_by: source.tag,
            external_source: source.tag,
            external_uid: `${source.tag}:${marker.roomId}:${marker.start}-${marker.end}`,
            external_feed_url: `https://docs.google.com/spreadsheets/d/${source.sheetId}`,
            external_synced_at: syncedAt,
        });
        if (!insertError) {
            inserted += 1;
        } else if (insertError.code === '23P01' || insertError.message?.includes('Наложение')) {
            skipped += 1;
        } else {
            throw new Error(insertError.message);
        }
    }

    deleteCacheByPrefix('hotel-calendar:');

    return {
        hotelId,
        dryRun: false,
        roomsTotal: roomIds.length,
        ourReserves: ourRows.length,
        movedBookings: 0,
        markersPlanned: markers.length,
        inserted,
        skipped,
    };
};

// ---------------------------------------------------------------------------
// Shelter: по категориям, с упаковкой наших броний вниз (v2).
// ---------------------------------------------------------------------------
const syncShelter = async (
    supabase: SupabaseClient,
    hotelId: string,
    source: ShelterMirrorSource,
    options: { dryRun?: boolean; horizonDays?: number },
): Promise<MirrorSyncResult> => {
    const dryRun = options.dryRun === true;
    const horizonDays = options.horizonDays ?? 365;

    const allRoomIds = source.categories.flatMap((category) => category.roomIds);

    // 1. Занятость у отельера (по категориям, по дням).
    const occupancy = await readShelterOccupancy(
        source.token,
        source.categories.map((category) => ({
            categoryId: category.categoryId,
            totalRooms: category.roomIds.length,
        })),
        horizonDays,
    );
    const occByCategory = new Map(occupancy.map((item) => [item.categoryId, item]));

    // 2. Наши брони в этих номерах (всё, кроме наших же зеркальных меток).
    const { data: rows, error } = await supabase
        .from('reserves')
        .select('id, room_id, start, end, external_source')
        .in('room_id', allRoomIds);
    if (error) {
        throw new Error(error.message);
    }
    const ourRows = ((rows ?? []) as ReserveRow[]).filter(
        (row) => row.external_source !== MIRROR_SOURCE_TAG,
    );

    // 3. v2: упаковка вниз по каждой категории.
    const allMoves: RepackMove[] = [];
    const finalRoomByReserveId = new Map<string, string>();
    for (const category of source.categories) {
        const catRoomSet = new Set(category.roomIds);
        const catBookings: RepackBooking[] = ourRows
            .filter((row) => catRoomSet.has(row.room_id))
            .map((row) => ({ id: row.id, roomId: row.room_id, start: row.start, end: row.end }));
        const { moves, finalRoomById } = computePullDownRepack(category.roomIds, catBookings);
        allMoves.push(...moves);
        for (const [id, roomId] of finalRoomById) finalRoomByReserveId.set(id, roomId);
    }

    const repackedReserves: OurReserve[] = ourRows.map((row) => ({
        room_id: finalRoomByReserveId.get(row.id) ?? row.room_id,
        start: row.start,
        end: row.end,
    }));

    // 4. Внешние метки поверх упакованных броней.
    const markers = computeMirrorMarkers(
        source.categories.map((category) => ({
            roomIds: category.roomIds,
            occupancy: occByCategory.get(category.categoryId)!,
        })),
        repackedReserves,
    );

    if (dryRun) {
        return {
            hotelId,
            dryRun: true,
            roomsTotal: allRoomIds.length,
            ourReserves: ourRows.length,
            movedBookings: allMoves.length,
            markersPlanned: markers.length,
            inserted: 0,
            skipped: 0,
            moves: allMoves,
            markers,
        };
    }

    const syncedAt = new Date().toISOString();

    // Убрать прежние зеркальные метки (освобождает строки под перестановку).
    const { error: deleteError } = await supabase
        .from('reserves')
        .delete()
        .eq('external_source', MIRROR_SOURCE_TAG)
        .in('room_id', allRoomIds);
    if (deleteError) {
        throw new Error(deleteError.message);
    }

    // Применить переезды В ТОМ ЖЕ ПОРЯДКЕ — каждый в свободную строку.
    let movedBookings = 0;
    for (const move of allMoves) {
        const { error: moveError } = await supabase
            .from('reserves')
            .update({ room_id: move.toRoomId })
            .eq('id', move.id);
        if (!moveError) {
            movedBookings += 1;
        } else if (!(moveError.code === '23P01' || moveError.message?.includes('Наложение'))) {
            throw new Error(moveError.message);
        }
    }

    // Вставить новые метки; пересечения с нашими бронями (А1) пропускаем.
    let inserted = 0;
    let skipped = 0;
    for (const marker of markers) {
        const { error: insertError } = await supabase.from('reserves').insert({
            room_id: marker.roomId,
            start: marker.start,
            end: marker.end,
            guest: DEFAULT_GUEST,
            phone: '',
            price: 0,
            quantity: 1,
            comment: 'Занятость из чужого календаря (зеркало)',
            created_by: MIRROR_SOURCE_TAG,
            edited_at: syncedAt,
            edited_by: MIRROR_SOURCE_TAG,
            external_source: MIRROR_SOURCE_TAG,
            external_uid: `${MIRROR_SOURCE_TAG}:${marker.roomId}:${marker.start}-${marker.end}`,
            external_feed_url: source.widgetUrl,
            external_synced_at: syncedAt,
        });

        if (!insertError) {
            inserted += 1;
        } else if (insertError.code === '23P01' || insertError.message?.includes('Наложение')) {
            skipped += 1;
        } else {
            throw new Error(insertError.message);
        }
    }

    deleteCacheByPrefix('hotel-calendar:');

    return {
        hotelId,
        dryRun: false,
        roomsTotal: allRoomIds.length,
        ourReserves: ourRows.length,
        movedBookings,
        markersPlanned: markers.length,
        inserted,
        skipped,
    };
};
