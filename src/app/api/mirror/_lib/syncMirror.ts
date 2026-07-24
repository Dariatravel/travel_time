// Оркестратор голубой шахматки: тянет занятость из чужого источника и
// приводит нашу шахматку в зеркало — наши брони не трогаем, дописываем/
// пересобираем только внешние метки (external_source='mirror_shelter').

import type { SupabaseClient } from '@supabase/supabase-js';

import { deleteCacheByPrefix } from '@/app/api/yandex-backend/_lib/memoryCache';

import { computeMirrorMarkers, type OurReserve } from './computeMirrorReserves';
import { getMirrorSource } from './mirrorSources';
import { readShelterOccupancy } from './shelterFrontdesk';

const MIRROR_SOURCE_TAG = 'mirror_shelter';
const DEFAULT_GUEST = 'Занято (внешний календарь)';

export type MirrorSyncResult = {
    hotelId: string;
    dryRun: boolean;
    roomsTotal: number;
    ourReserves: number;
    markersPlanned: number;
    inserted: number;
    skipped: number;
    markers?: Array<{ roomId: string; start: number; end: number }>;
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
        .select('room_id, start, end, external_source')
        .in('room_id', allRoomIds);
    if (error) {
        throw new Error(error.message);
    }
    const ourReserves: OurReserve[] = (rows ?? [])
        .filter((row) => row.external_source !== MIRROR_SOURCE_TAG)
        .map((row) => ({ room_id: row.room_id, start: row.start, end: row.end }));

    // 3. Вычислить внешние метки (наши брони + метки = занятость у отельера).
    const markers = computeMirrorMarkers(
        source.categories.map((category) => ({
            roomIds: category.roomIds,
            occupancy: occByCategory.get(category.categoryId)!,
        })),
        ourReserves,
    );

    if (dryRun) {
        return {
            hotelId,
            dryRun: true,
            roomsTotal: allRoomIds.length,
            ourReserves: ourReserves.length,
            markersPlanned: markers.length,
            inserted: 0,
            skipped: 0,
            markers,
        };
    }

    // 4. Убрать прежние зеркальные метки этого отеля.
    const { error: deleteError } = await supabase
        .from('reserves')
        .delete()
        .eq('external_source', MIRROR_SOURCE_TAG)
        .in('room_id', allRoomIds);
    if (deleteError) {
        throw new Error(deleteError.message);
    }

    // 5. Вставить новые метки по одной; пересечения с нашими бронями (А1, 23P01)
    //    пропускаем — наши брони главнее.
    const syncedAt = new Date().toISOString();
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

    // Сбросить серверный кэш календарей, чтобы шахматка обновилась сразу.
    deleteCacheByPrefix('hotel-calendar:');

    return {
        hotelId,
        dryRun: false,
        roomsTotal: allRoomIds.length,
        ourReserves: ourReserves.length,
        markersPlanned: markers.length,
        inserted,
        skipped,
    };
};
