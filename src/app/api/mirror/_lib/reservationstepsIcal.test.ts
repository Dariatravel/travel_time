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

    it('повторяет запрос при временном сбое сети — из-за него не отменяем весь отель', async () => {
        // Так падал «Грасс»: одна лента из пяти отвечала «fetch failed»,
        // и синхронизация всего отеля отменялась.
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new Error('fetch failed'))
            .mockImplementation(() => Promise.resolve(new Response(EMPTY_ICAL, { status: 200 })));
        vi.stubGlobal('fetch', fetchMock);

        const result = await readIcalOccupancy([{ icalId: 1 }]);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result.sourceComplete).toBe(true);
        expect(result.failedCategoryIds).toEqual([]);
    });

    it('повторяет при 503 и сдаётся, если сбой не проходит', async () => {
        const fetchMock = vi
            .fn()
            .mockImplementation(() => Promise.resolve(new Response('', { status: 503 })));
        vi.stubGlobal('fetch', fetchMock);

        const result = await readIcalOccupancy([{ icalId: 7 }]);

        expect(fetchMock).toHaveBeenCalledTimes(3); // первая попытка + два повтора
        expect(result.sourceComplete).toBe(false);
        expect(result.failedCategoryIds).toEqual([7]);
    });

    it('на 404 повторов не делает — ленту удалили, повтор ничего не изменит', async () => {
        const fetchMock = vi
            .fn()
            .mockImplementation(() => Promise.resolve(new Response('', { status: 404 })));
        vi.stubGlobal('fetch', fetchMock);

        const result = await readIcalOccupancy([{ icalId: 9 }]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.sourceComplete).toBe(false);
    });
});
