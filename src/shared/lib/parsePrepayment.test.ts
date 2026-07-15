import { describe, expect, it } from 'vitest';

import { parsePrepayment } from '@/shared/lib/parsePrepayment';

describe('parsePrepayment', () => {
    it('null / undefined / пустая строка -> 0', () => {
        expect(parsePrepayment(null)).toBe(0);
        expect(parsePrepayment(undefined)).toBe(0);
        expect(parsePrepayment('')).toBe(0);
    });

    it('число возвращается как есть', () => {
        expect(parsePrepayment(5000)).toBe(5000);
        expect(parsePrepayment(0)).toBe(0);
    });

    it('числовая строка (как из базы) приводится к числу', () => {
        expect(parsePrepayment('5000')).toBe(5000);
        expect(parsePrepayment('0')).toBe(0);
        expect(parsePrepayment('1500.50')).toBe(1500.5);
    });

    it('нечисловая строка -> 0 (без NaN)', () => {
        expect(parsePrepayment('abc')).toBe(0);
        expect(parsePrepayment('5000 руб')).toBe(0);
    });
});
