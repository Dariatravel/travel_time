import { describe, expect, it } from 'vitest';

import {
    hasReserveNightOverlap,
    toReserveDayIndex,
    toReserveUnix,
} from '@/shared/lib/reserveOverlap';

const DAY = 86_400;
// Сутки D по московскому календарю: заезд 14:00 МСК = 11:00 UTC, выезд 12:00 МСК = 09:00 UTC.
const checkIn = (day: number) => day * DAY + 11 * 3600;
const checkOut = (day: number) => day * DAY + 9 * 3600;

describe('toReserveUnix', () => {
    it('возвращает число как есть', () => {
        expect(toReserveUnix(1_700_000_000)).toBe(1_700_000_000);
    });

    it('переводит Date в unix-секунды', () => {
        const date = new Date('2026-07-20T11:00:00.000Z');
        expect(toReserveUnix(date)).toBe(Math.floor(date.getTime() / 1000));
    });
});

describe('toReserveDayIndex', () => {
    it('заезд 14:00 и выезд 12:00 одного дня дают один индекс суток', () => {
        expect(toReserveDayIndex(checkIn(20_000))).toBe(20_000);
        expect(toReserveDayIndex(checkOut(20_000))).toBe(20_000);
    });
});

describe('hasReserveNightOverlap', () => {
    it('стыковые брони (выезд в день заезда следующей) НЕ конфликтуют', () => {
        const a = { start: checkIn(100), end: checkOut(105) };
        const b = { start: checkIn(105), end: checkOut(110) };
        expect(hasReserveNightOverlap(a, b)).toBe(false);
        expect(hasReserveNightOverlap(b, a)).toBe(false);
    });

    it('пересекающиеся по ночам брони конфликтуют', () => {
        const a = { start: checkIn(100), end: checkOut(105) };
        const b = { start: checkIn(103), end: checkOut(108) };
        expect(hasReserveNightOverlap(a, b)).toBe(true);
        expect(hasReserveNightOverlap(b, a)).toBe(true);
    });

    it('бронь, целиком вложенная в другую, конфликтует', () => {
        const outer = { start: checkIn(100), end: checkOut(110) };
        const inner = { start: checkIn(103), end: checkOut(105) };
        expect(hasReserveNightOverlap(outer, inner)).toBe(true);
        expect(hasReserveNightOverlap(inner, outer)).toBe(true);
    });

    it('одна ночь внутри периода — конфликт', () => {
        const a = { start: checkIn(100), end: checkOut(101) };
        const period = { start: checkIn(99), end: checkOut(102) };
        expect(hasReserveNightOverlap(a, period)).toBe(true);
    });

    it('брони в разные месяцы не конфликтуют', () => {
        const a = { start: checkIn(100), end: checkOut(103) };
        const b = { start: checkIn(200), end: checkOut(203) };
        expect(hasReserveNightOverlap(a, b)).toBe(false);
    });

    it('работает с Date-объектами так же, как с unix', () => {
        const a = {
            start: new Date('2026-07-20T11:00:00.000Z'),
            end: new Date('2026-07-25T09:00:00.000Z'),
        };
        const bAdjacent = {
            start: new Date('2026-07-25T11:00:00.000Z'),
            end: new Date('2026-07-28T09:00:00.000Z'),
        };
        const bOverlap = {
            start: new Date('2026-07-23T11:00:00.000Z'),
            end: new Date('2026-07-28T09:00:00.000Z'),
        };
        expect(hasReserveNightOverlap(a, bAdjacent)).toBe(false);
        expect(hasReserveNightOverlap(a, bOverlap)).toBe(true);
    });
});
