import { describe, expect, it } from 'vitest';

import { buildTimelineGroups } from './timelineGroups';
import type { RoomReserves } from '@/shared/api/room/room';

const room = (over: Partial<RoomReserves>): RoomReserves => ({
    id: over.id ?? 'id',
    hotel_id: 'h1',
    title: over.title ?? 'Номер',
    price: 0,
    quantity: 2,
    image_title: '',
    image_path: '',
    order: over.order,
    is_service: over.is_service,
    reserves: over.reserves ?? [],
});

const reserve = () => ({ id: 'r', room_id: 'buf' }) as unknown as RoomReserves['reserves'][number];

describe('buildTimelineGroups', () => {
    it('ставит служебную строку «Буфер для переноса» последней, независимо от order', () => {
        const groups = buildTimelineGroups([
            room({ id: 'buf', title: 'Буфер для переноса', is_service: true, order: 0 }),
            room({ id: 'a', title: 'Номер 1', order: 5 }),
            room({ id: 'b', title: 'Номер 2', order: 10 }),
        ]);

        expect(groups.map((g) => g.id)).toEqual(['a', 'b', 'buf']);
    });

    it('сохраняет относительный порядок обычных номеров', () => {
        const groups = buildTimelineGroups([
            room({ id: 'a', order: 1 }),
            room({ id: 'buf', is_service: true }),
            room({ id: 'b', order: 2 }),
        ]);

        expect(groups.map((g) => g.id)).toEqual(['a', 'b', 'buf']);
    });

    it('выставляет hasBufferBooking, когда в буфере есть бронь', () => {
        const groups = buildTimelineGroups([
            room({ id: 'buf', is_service: true, reserves: [reserve()] }),
        ]);

        expect(groups[0].hasBufferBooking).toBe(true);
    });

    it('не выставляет hasBufferBooking для пустого буфера', () => {
        const groups = buildTimelineGroups([room({ id: 'buf', is_service: true, reserves: [] })]);

        expect(groups[0].hasBufferBooking).toBe(false);
    });

    it('никогда не помечает hasBufferBooking у обычного номера с бронями', () => {
        const groups = buildTimelineGroups([room({ id: 'a', reserves: [reserve()] })]);

        expect(groups[0].hasBufferBooking).toBe(false);
    });

    it('на пустом или отсутствующем списке возвращает []', () => {
        expect(buildTimelineGroups([])).toEqual([]);
        expect(buildTimelineGroups()).toEqual([]);
    });
});
