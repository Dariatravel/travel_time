import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import type { FreeHotelsDTO, FreeHotelRoomDTO } from '@/shared/api/hotel/hotel';
import type { ReserveDTO } from '@/shared/api/reserve/reserve';

export const dynamic = 'force-dynamic';

type AvailabilityFilter = {
    start_time?: number | null;
    end_time?: number | null;
    hotel_type_filter?: string | null;
    room_type_filter?: string | null;
    min_quantity_filter?: number | null;
    city_filter?: string[] | null;
    room_features_filter?: string[] | null;
    features_filter?: string[] | null;
    eat_filter?: string[] | null;
    beach_filter?: string[] | null;
    beach_distance_filter?: string[] | null;
    min_price_filter?: number | null;
    max_price_filter?: number | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parseRooms = (rooms: unknown): FreeHotelRoomDTO[] => {
    let parsedRooms = rooms;

    if (typeof parsedRooms === 'string') {
        try {
            parsedRooms = JSON.parse(parsedRooms);
        } catch {
            return [];
        }
    }

    if (!Array.isArray(parsedRooms)) {
        return [];
    }

    return parsedRooms
        .map((room): FreeHotelRoomDTO | null => {
            if (!isRecord(room)) return null;

            const roomId = room.room_id ?? room.id;
            if (typeof roomId !== 'string' || roomId.length === 0) return null;

            return {
                ...room,
                room_id: roomId,
                room_title:
                    typeof room.room_title === 'string'
                        ? room.room_title
                        : typeof room.title === 'string'
                          ? room.title
                          : '',
                room_price:
                    typeof room.room_price === 'number'
                        ? room.room_price
                        : typeof room.price === 'number'
                          ? room.price
                          : undefined,
                reserves: Array.isArray(room.reserves) ? (room.reserves as ReserveDTO[]) : [],
            };
        })
        .filter((room): room is FreeHotelRoomDTO => room !== null);
};

const normalizeAvailabilityRows = (rows: unknown): FreeHotelsDTO[] => {
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows
        .map((row): FreeHotelsDTO | null => {
            if (!isRecord(row)) return null;

            const hotelId = row.hotel_id;
            if (typeof hotelId !== 'string' || hotelId.length === 0) return null;

            const rooms = parseRooms(row.rooms);

            return {
                free_room_count:
                    typeof row.free_room_count === 'number' ? row.free_room_count : rooms.length,
                hotel_id: hotelId,
                hotel_title: typeof row.hotel_title === 'string' ? row.hotel_title : '',
                rooms,
            };
        })
        .filter((hotel): hotel is FreeHotelsDTO => hotel !== null && hotel.rooms.length > 0);
};

const hasValidPeriod = (
    filter: AvailabilityFilter,
): filter is AvailabilityFilter & { start_time: number; end_time: number } =>
    typeof filter.start_time === 'number' &&
    typeof filter.end_time === 'number' &&
    filter.start_time < filter.end_time;

const normalizeRpcFilter = (filter: AvailabilityFilter) => ({
    start_time: filter.start_time ?? null,
    end_time: filter.end_time ?? null,
    hotel_type_filter: filter.hotel_type_filter ?? filter.room_type_filter ?? null,
    min_quantity_filter: filter.min_quantity_filter ?? null,
    city_filter: filter.city_filter ?? null,
    room_features_filter: filter.room_features_filter ?? null,
    features_filter: filter.features_filter ?? null,
    eat_filter: filter.eat_filter ?? null,
    beach_filter: filter.beach_filter ?? null,
    beach_distance_filter: filter.beach_distance_filter ?? null,
    min_price_filter: filter.min_price_filter ?? null,
    max_price_filter: filter.max_price_filter ?? null,
});

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
        return error.message;
    }

    if (isRecord(error)) {
        const details = [error.message, error.details, error.hint, error.code]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .join(' ');

        if (details) {
            return details;
        }
    }

    return 'Failed to calculate available hotels';
};

export async function POST(request: NextRequest) {
    const filter = (await request.json().catch(() => null)) as AvailabilityFilter | null;
    if (!filter || !isRecord(filter)) {
        return NextResponse.json({ error: 'Invalid availability filter' }, { status: 400 });
    }

    try {
        const supabase = createSupabaseServiceRoleClient();
        const rpcFilter = normalizeRpcFilter(filter);
        const { data, error } = await supabase.rpc('get_available_hotels', rpcFilter);

        if (error) throw error;

        const hiddenHotelsResponse = await supabase
            .from('hotels')
            .select('id')
            .eq('is_search_visible', false);

        if (hiddenHotelsResponse.error) {
            console.warn('Unable to apply hidden hotel filter', hiddenHotelsResponse.error);
        }

        const hiddenHotelIds = new Set(
            hiddenHotelsResponse.error ? [] : (hiddenHotelsResponse.data ?? []).map((hotel) => hotel.id),
        );
        let hotels = normalizeAvailabilityRows(data).filter(
            (hotel) => !hiddenHotelIds.has(hotel.hotel_id),
        );

        if (hasValidPeriod(filter)) {
            const roomIds = Array.from(
                new Set(hotels.flatMap((hotel) => hotel.rooms.map((room) => room.room_id))),
            );

            if (roomIds.length > 0) {
                const { data: closures, error: closuresError } = await supabase
                    .from('room_closures')
                    .select('room_id')
                    .in('room_id', roomIds)
                    .lt('start', filter.end_time)
                    .gt('end', filter.start_time);

                if (closuresError) {
                    console.warn('Unable to apply room closure filter', closuresError);
                    return NextResponse.json(hotels);
                }

                const closedRoomIds = new Set((closures ?? []).map((closure) => closure.room_id));
                if (closedRoomIds.size > 0) {
                    hotels = hotels
                        .map((hotel) => {
                            const rooms = hotel.rooms.filter(
                                (room) => !closedRoomIds.has(room.room_id),
                            );

                            return {
                                ...hotel,
                                rooms,
                                free_room_count: rooms.length,
                            };
                        })
                        .filter((hotel) => hotel.rooms.length > 0);
                }
            }
        }

        return NextResponse.json(hotels);
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 502 });
    }
}
