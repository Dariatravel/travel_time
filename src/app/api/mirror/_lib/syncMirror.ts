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
import { getMirrorSource, type IcalMirrorSource, type ShelterMirrorSource } from './mirrorSources';
import { readIcalOccupancy } from './reservationstepsIcal';
import { computePullDownRepack, type RepackBooking, type RepackMove } from './repackBookings';
import { readShelterOccupancy } from './shelterFrontdesk';

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
    return syncShelter(supabase, hotelId, source, options);
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
        roomIdsByCategory.set(
            category.icalId,
            rooms
                .filter(
                    (room) =>
                        room.title === category.titlePrefix ||
                        (room.title ?? '').startsWith(`${category.titlePrefix} `),
                )
                .map((room) => room.id),
        );
    }
    const allRoomIds = [...roomIdsByCategory.values()].flat();
    if (allRoomIds.length === 0) {
        throw new Error('Не найдены номера отеля для категорий источника');
    }

    const occupancy = await readIcalOccupancy(source.categories, options.horizonDays ?? 365);

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
        for (let n = Math.floor(row.start / NIGHT); n < Math.floor(row.end / NIGHT); n += 1) {
            nights.add(n);
        }
    }

    const markers: Array<{ roomId: string; start: number; end: number; icalId: number }> = [];
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
            markers: markers.map(({ roomId, start, end }) => ({ roomId, start, end })),
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
