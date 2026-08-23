import { afterEach, describe, expect, it, vi } from 'vitest';

import { readIcalOccupancy } from './reservationstepsIcal';

const EMPTY_ICAL = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'END:VCALENDAR'].join('\r\n');

describe('readIcalOccupancy', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('подтверждает пустоту только после успешного чтения всех категорий', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockImplementation(() =>
                    Promise.resolve(new Response(EMPTY_ICAL, { status: 200 })),
                ),
        );

        const result = await readIcalOccupancy([{ icalId: 1 }, { icalId: 2 }]);

        expect(result).toEqual({
            categories: [
                { icalId: 1, intervals: [] },
                { icalId: 2, intervals: [] },
            ],
            sourceComplete: true,
            confirmedEmpty: true,
            failedCategoryIds: [],
        });
    });

    it('не выдаёт сетевой сбой за пустой календарь', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

        const result = await readIcalOccupancy([{ icalId: 523508 }]);

        expect(result.sourceComplete).toBe(false);
        expect(result.confirmedEmpty).toBe(false);
        expect(result.failedCategoryIds).toEqual([523508]);
    });

    it('считает неполным ответом HTTP 200 без структуры iCal', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(new Response('<html>temporary error</html>', { status: 200 })),
        );

        const result = await readIcalOccupancy([{ icalId: 523508 }]);

        expect(result.sourceComplete).toBe(false);
        expect(result.confirmedEmpty).toBe(false);
    });
});
