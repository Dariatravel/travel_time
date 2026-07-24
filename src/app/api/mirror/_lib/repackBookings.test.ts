import { describe, expect, it } from 'vitest';

import { computePullDownRepack, type RepackBooking } from './repackBookings';

const NIGHT = 86400;
const b = (id: string, roomId: string, fromNight: number, toNight: number): RepackBooking => ({
    id,
    roomId,
    start: fromNight * NIGHT,
    end: toNight * NIGHT,
});

const rooms = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];

describe('computePullDownRepack (v2, упаковка вниз без свопов)', () => {
    it('опускает одиночную бронь в самый нижний номер', () => {
        const { finalRoomById } = computePullDownRepack(rooms, [b('x', 'r6', 10, 15)]);
        expect(finalRoomById.get('x')).toBe('r1');
    });

    it('НЕ делает своп пересекающихся броней (Трусова/Ермакова)', () => {
        // Ермакова уже в r1 (10–21), Трусова в r2 (10–17) — пересекаются.
        const { finalRoomById, moves } = computePullDownRepack(rooms, [
            b('ermakova', 'r1', 10, 21),
            b('trusova', 'r2', 10, 17),
        ]);
        // r1 занят Ермаковой на эти даты → Трусова НЕ может опуститься в r1.
        expect(finalRoomById.get('ermakova')).toBe('r1');
        expect(finalRoomById.get('trusova')).toBe('r2');
        expect(moves).toHaveLength(0);
    });

    it('непересекающиеся брони собираются в один нижний номер', () => {
        const { finalRoomById } = computePullDownRepack(rooms, [
            b('a', 'r3', 1, 5),
            b('c', 'r5', 6, 10), // после a, не пересекается
        ]);
        expect(finalRoomById.get('a')).toBe('r1');
        expect(finalRoomById.get('c')).toBe('r1'); // тот же номер, встык
    });

    it('каждый переезд идёт в свободную строку (применимо без конфликта А1)', () => {
        const { moves } = computePullDownRepack(rooms, [
            b('a', 'r2', 1, 10),
            b('b', 'r4', 1, 10), // пересекается с a
        ]);
        // a → r1, b → r2 (r1 занят a на эти даты, r2 свободен)
        const final = new Map(moves.map((m) => [m.id, m.toRoomId]));
        expect(final.get('a')).toBe('r1');
        expect(final.get('b')).toBe('r2');
    });

    it('брони, уже стоящие внизу, не двигаются', () => {
        const { moves } = computePullDownRepack(rooms, [b('a', 'r1', 1, 5), b('b', 'r2', 1, 5)]);
        expect(moves).toHaveLength(0);
    });
});
