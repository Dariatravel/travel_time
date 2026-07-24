// Оркестратор голубой шахматки. Приводит нашу шахматку к зеркалу чужого
// календаря:
//  v2 — наши брони упаковываются вниз по строкам-номерам (ДАТЫ не меняются,
//       только room_id, каждый переезд в свободную строку → без конфликтов А1);
//  затем внешняя занятость по категории «занято N из M» дописывается метками
//  «Занято» на свободные номера (external_source='mirror_shelter').

import type { SupabaseClient } from '@supabase/supabase-js';

import { deleteCacheByPrefix } from '@/app/api/yandex-backend/_lib/memoryCache';

import { computeMirrorMarkers, type OurReserve } from './computeMirrorReserves';
import { getMirrorSource } from './mirrorSources';
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
    const dryRun = options.dryRun === true;
    const horizonDays = options.horizonDays ?? 365;

    const source = getMirrorSource(hotelId);
    if (!source) {
        throw new Error('Для этого отеля не настроено зеркало занятости');
    }
    if (source.system !== 'shelter') {
        throw new Error('Пока поддерживается только источник Shelter');
    }

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

    // 3. v2: упаковка вниз по каждой категории — последовательность переездов
    //    и итоговые позиции наших броней.
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

    // Наши брони в ИТОГОВЫХ позициях (для расчёта меток).
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

    // 5. Убрать прежние зеркальные метки (освобождает строки под перестановку).
    const { error: deleteError } = await supabase
        .from('reserves')
        .delete()
        .eq('external_source', MIRROR_SOURCE_TAG)
        .in('room_id', allRoomIds);
    if (deleteError) {
        throw new Error(deleteError.message);
    }

    // 6. Применить переезды В ТОМ ЖЕ ПОРЯДКЕ — каждый в свободную строку. Если
    //    строка вдруг занята (закрытие номера и т.п.) — пропускаем эту бронь,
    //    не роняя синк.
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

    // 7. Вставить новые метки; пересечения с нашими бронями (А1) пропускаем.
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
