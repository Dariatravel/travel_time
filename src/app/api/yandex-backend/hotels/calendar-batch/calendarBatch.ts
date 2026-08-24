import { createHash } from 'node:crypto';

import type { HotelRoomsReservesDTO } from '@/shared/api/hotel/hotel';
import type { ReserveDTO } from '@/shared/api/reserve/reserve';
import type { RoomReserves } from '@/shared/api/room/room';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_HOTELS = 500;
const MAX_ROOMS_PER_HOTEL = 1000;
const MAX_TOTAL_ALLOWED_ROOMS = 5000;

export type CalendarBatchAccessLevel = 'staff' | 'owner';

export type CalendarBatchItem = {
    hotelId: string;
    allowedRooms?: string[];
};

type HotelRow = Record<string, unknown> & {
    id: string;
    user_id?: string | null;
};

type RoomRow = Record<string, unknown> & {
    id: string;
    hotel_id: string;
    title: string;
    price: number;
    quantity: number;
    reserves?: ReserveDTO[] | null;
};

const assertUuid = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        throw new Error(`${label} должен быть UUID`);
    }
    return value;
};

export const parseCalendarBatchItems = (payload: unknown): CalendarBatchItem[] => {
    if (
        !payload ||
        typeof payload !== 'object' ||
        !Array.isArray((payload as { hotels?: unknown }).hotels)
    ) {
        throw new Error('Поле hotels должно быть массивом');
    }

    const hotels = (payload as { hotels: unknown[] }).hotels;
    if (hotels.length === 0 || hotels.length > MAX_HOTELS) {
        throw new Error(`Количество отелей должно быть от 1 до ${MAX_HOTELS}`);
    }

    const seenHotelIds = new Set<string>();
    let totalAllowedRooms = 0;
    return hotels.map((item, index) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`hotels[${index}] должен быть объектом`);
        }

        const record = item as { hotelId?: unknown; allowedRooms?: unknown };
        const hotelId = assertUuid(record.hotelId, `hotels[${index}].hotelId`);
        if (seenHotelIds.has(hotelId)) throw new Error(`Отель ${hotelId} указан дважды`);
        seenHotelIds.add(hotelId);

        if (record.allowedRooms === undefined) return { hotelId };
        if (
            !Array.isArray(record.allowedRooms) ||
            record.allowedRooms.length > MAX_ROOMS_PER_HOTEL
        ) {
            throw new Error(
                `hotels[${index}].allowedRooms должен быть массивом до ${MAX_ROOMS_PER_HOTEL} элементов`,
            );
        }

        const allowedRooms = Array.from(
            new Set(
                record.allowedRooms.map((roomId, roomIndex) =>
                    assertUuid(roomId, `hotels[${index}].allowedRooms[${roomIndex}]`),
                ),
            ),
        ).sort();
        totalAllowedRooms += allowedRooms.length;
        if (totalAllowedRooms > MAX_TOTAL_ALLOWED_ROOMS) {
            throw new Error(
                `Общее количество allowedRooms не должно превышать ${MAX_TOTAL_ALLOWED_ROOMS}`,
            );
        }

        return { hotelId, allowedRooms };
    });
};

export const chunkCalendarIds = (ids: string[], chunkSize = 50): string[][] => {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0)
        throw new Error('chunkSize должен быть положительным');

    const chunks: string[][] = [];
    for (let index = 0; index < ids.length; index += chunkSize) {
        chunks.push(ids.slice(index, index + chunkSize));
    }
    return chunks;
};

export const createCalendarBatchCacheKey = (
    items: CalendarBatchItem[],
    userId: string,
    accessLevel: CalendarBatchAccessLevel,
) => {
    // Порядок входит в ключ: ответ сохраняет порядок запроса, поэтому два
    // набора с одинаковыми id, но разной последовательностью нельзя склеивать.
    const canonicalItems = items.map((item) => ({
        hotelId: item.hotelId,
        allowedRooms: item.allowedRooms?.slice().sort() ?? null,
    }));
    const requestHash = createHash('sha256').update(JSON.stringify(canonicalItems)).digest('hex');

    return ['hotel-calendar-batch', userId, accessLevel, requestHash].join(':');
};

export const filterHotelsForCalendarAccess = <T extends HotelRow>(
    hotels: T[],
    userId: string,
    accessLevel: CalendarBatchAccessLevel,
): T[] => {
    if (accessLevel === 'staff') return hotels;
    return hotels.filter((hotel) => hotel.user_id === userId);
};

export const buildCalendarBatchRows = (
    items: CalendarBatchItem[],
    hotelRows: HotelRow[],
    roomRows: RoomRow[],
): HotelRoomsReservesDTO[] => {
    const hotelById = new Map(hotelRows.map((hotel) => [hotel.id, hotel]));
    const roomsByHotel = new Map<string, RoomRow[]>();

    for (const room of roomRows) {
        const rooms = roomsByHotel.get(room.hotel_id) ?? [];
        rooms.push(room);
        roomsByHotel.set(room.hotel_id, rooms);
    }

    return items.flatMap((item) => {
        const hotel = hotelById.get(item.hotelId);
        if (!hotel) return [];

        const allowedRoomIds = item.allowedRooms ? new Set(item.allowedRooms) : null;
        const rooms = (roomsByHotel.get(item.hotelId) ?? [])
            .filter((room) => !allowedRoomIds || allowedRoomIds.has(room.id))
            .map((room) => ({
                ...room,
                image_title: room.image_title || '',
                image_path: room.image_path || '',
                room_features: room.room_features || [],
                order: room.order ?? 0,
                reserves: (room.reserves || []) as ReserveDTO[],
            }))
            .sort((left, right) => Number(left.order ?? 999) - Number(right.order ?? 999));

        return [{ ...hotel, rooms: rooms as RoomReserves[] } as HotelRoomsReservesDTO];
    });
};
