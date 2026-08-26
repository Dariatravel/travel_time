import { describe, expect, it } from 'vitest';

import {
    buildCalendarBatchRows,
    chunkCalendarIds,
    createCalendarBatchCacheKey,
    filterHotelsForCalendarAccess,
    parseCalendarBatchItems,
} from './calendarBatch';

const HOTEL_A = '11111111-1111-4111-8111-111111111111';
const HOTEL_B = '22222222-2222-4222-8222-222222222222';
const ROOM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROOM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('пакет календарей отелей', () => {
    it('проверяет вход и нормализует список разрешённых номеров', () => {
        expect(
            parseCalendarBatchItems({
                hotels: [{ hotelId: HOTEL_A, allowedRooms: [ROOM_B, ROOM_A, ROOM_B] }],
            }),
        ).toEqual([{ hotelId: HOTEL_A, allowedRooms: [ROOM_A, ROOM_B] }]);

        expect(() => parseCalendarBatchItems({ hotels: [{ hotelId: 'not-uuid' }] })).toThrow(
            /UUID/,
        );
        expect(() => parseCalendarBatchItems({ hotels: [] })).toThrow(/от 1/);
    });

    it('разбивает 234 отеля на пять безопасных запросов к базе', () => {
        const ids = Array.from({ length: 234 }, (_, index) => String(index));
        expect(chunkCalendarIds(ids)).toHaveLength(5);
        expect(chunkCalendarIds(ids).flat()).toEqual(ids);
    });

    it('изолирует кэш по пользователю и уровню доступа', () => {
        const items = [{ hotelId: HOTEL_A }, { hotelId: HOTEL_B }];
        const ownerA = createCalendarBatchCacheKey(items, 'user-a', 'owner');

        expect(createCalendarBatchCacheKey(items, 'user-b', 'owner')).not.toBe(ownerA);
        expect(createCalendarBatchCacheKey(items, 'user-a', 'staff')).not.toBe(ownerA);
        expect(createCalendarBatchCacheKey([...items].reverse(), 'user-a', 'owner')).not.toBe(
            ownerA,
        );
    });

    it('отельер получает только свои отели, staff получает весь разрешённый набор', () => {
        const hotels = [
            { id: HOTEL_A, user_id: 'owner-a' },
            { id: HOTEL_B, user_id: 'owner-b' },
        ];

        expect(filterHotelsForCalendarAccess(hotels, 'owner-a', 'owner')).toEqual([hotels[0]]);
        expect(filterHotelsForCalendarAccess(hotels, 'owner-a', 'staff')).toEqual(hotels);
    });

    it('не возвращает лишний отель или номер и сохраняет порядок запроса', () => {
        const rows = buildCalendarBatchRows(
            [{ hotelId: HOTEL_B }, { hotelId: HOTEL_A, allowedRooms: [ROOM_A] }],
            [
                { id: HOTEL_A, user_id: 'owner-a', title: 'A' },
                { id: HOTEL_B, user_id: 'owner-b', title: 'B' },
            ],
            [
                { id: ROOM_A, hotel_id: HOTEL_A, title: '1', price: 1, quantity: 1, reserves: [] },
                { id: ROOM_B, hotel_id: HOTEL_A, title: '2', price: 1, quantity: 1, reserves: [] },
            ],
        );

        expect(rows.map((hotel) => hotel.id)).toEqual([HOTEL_B, HOTEL_A]);
        expect(rows[1].rooms.map((room) => room.id)).toEqual([ROOM_A]);
    });
});
