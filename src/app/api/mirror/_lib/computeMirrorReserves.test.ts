import { describe, expect, it } from 'vitest';

import { computeMirrorMarkers, type OurReserve } from './computeMirrorReserves';
import type { CategoryOccupancy } from './shelterFrontdesk';

const NIGHT = 86400;
const N0 = 20000; // произвольный индекс ночи

const occ = (totalRooms: number, byNight: Record<number, number>): CategoryOccupancy => ({
    categoryId: 1,
    totalRooms,
    occupiedByNight: new Map(Object.entries(byNight).map(([n, v]) => [Number(n), v])),
});

// бронь, покрывающая ровно одну ночь n
const oneNight = (roomId: string, n: number): OurReserve => ({
    room_id: roomId,
    start: n * NIGHT,
    end: (n + 1) * NIGHT,
});

describe('computeMirrorMarkers (v1)', () => {
    const rooms = ['r1', 'r2', 'r3', 'r4', 'r5'];

    it('заполняет N свободных номеров метками, пакуя на нижние', () => {
        const markers = computeMirrorMarkers([{ roomIds: rooms, occupancy: occ(5, { [N0]: 3 }) }], []);
        expect(markers.map((m) => m.roomId).sort()).toEqual(['r1', 'r2', 'r3']);
    });

    it('не ставит метку на номер, где в эту ночь наша бронь', () => {
        const markers = computeMirrorMarkers(
            [{ roomIds: rooms, occupancy: occ(5, { [N0]: 3 }) }],
            [oneNight('r1', N0)],
        );
        const ids = markers.map((m) => m.roomId);
        expect(ids).not.toContain('r1'); // занят нашей бронью
        expect(ids.sort()).toEqual(['r2', 'r3']); // ещё 2 метки (всего занято 3)
    });

    it('если наши брони уже покрывают N — меток нет', () => {
        const markers = computeMirrorMarkers(
            [{ roomIds: rooms, occupancy: occ(5, { [N0]: 2 }) }],
            [oneNight('r1', N0), oneNight('r2', N0)],
        );
        expect(markers).toHaveLength(0);
    });

    it('занятость не превышает число номеров категории', () => {
        const markers = computeMirrorMarkers([{ roomIds: rooms, occupancy: occ(5, { [N0]: 9 }) }], []);
        expect(markers).toHaveLength(5); // максимум 5, не 9
    });

    it('подряд идущие занятые ночи схлопываются в один интервал', () => {
        const markers = computeMirrorMarkers(
            [{ roomIds: ['only'], occupancy: occ(1, { [N0]: 1, [N0 + 1]: 1, [N0 + 2]: 1 }) }],
            [],
        );
        expect(markers).toHaveLength(1); // одна метка на 3 ночи, а не три
        expect(markers[0].roomId).toBe('only');
        expect(markers[0].end).toBeGreaterThan(markers[0].start);
    });

    it('не трогает даты наших броней (возвращает только внешние метки)', () => {
        const markers = computeMirrorMarkers(
            [{ roomIds: rooms, occupancy: occ(5, { [N0]: 1 }) }],
            [oneNight('r1', N0)],
        );
        // занято 1, наша бронь и есть эта единица → внешних меток 0
        expect(markers).toHaveLength(0);
    });
});
