import { describe, expect, it } from 'vitest';
import { isExternalReserve } from './externalReserve';

describe('isExternalReserve', () => {
    it.each([
        [{ external_source: 'bnovo_djannat' }, true],
        [{ external_source: '  mirror_shelter  ' }, true],
        [{ external_source: null }, false],
        [{ external_source: '' }, false],
        [{ external_source: '   ' }, false],
        [undefined, false],
    ])('для %o возвращает %s', (reserve, expected) => {
        expect(isExternalReserve(reserve)).toBe(expected);
    });
});
