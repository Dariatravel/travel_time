import { afterEach, describe, expect, it, vi } from 'vitest';

import { readShelterOccupancy } from './shelterFrontdesk';

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const today = () => new Date().toISOString().slice(0, 10);

describe('readShelterOccupancy', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('подтверждает пустую занятость только после успешных ответов всех запросов', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(
                    jsonResponse({
                        data: [
                            { roomCategoryID: 10, date: today() },
                            { roomCategoryID: 20, date: today() },
                        ],
                    }),
                )
                .mockResolvedValueOnce(
                    jsonResponse({
                        data: [
                            [
                                { id: 10, availableRooms: 2 },
                                { id: 20, availableRooms: 1 },
                            ],
                        ],
                    }),
                ),
        );

        const result = await readShelterOccupancy(
            'public-widget-token',
            [
                { categoryId: 10, totalRooms: 2 },
                { categoryId: 20, totalRooms: 1 },
            ],
            1,
        );

        expect(result.sourceComplete).toBe(true);
        expect(result.confirmedEmpty).toBe(true);
        expect(result.failedProbes).toBe(0);
        expect(
            result.occupancy.every((category) =>
                [...category.occupiedByNight.values()].every((n) => n === 0),
            ),
        ).toBe(true);
    });

    it('не выдаёт сбой getAvailableDates за свободный отель', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

        const result = await readShelterOccupancy(
            'public-widget-token',
            [{ categoryId: 10, totalRooms: 2 }],
            1,
        );

        expect(result.sourceComplete).toBe(false);
        expect(result.confirmedEmpty).toBe(false);
        expect(result.failedProbes).toBeGreaterThan(0);
        expect(result.occupancy[0].occupiedByNight.size).toBe(0);
    });

    it('считает ответ неполным, если хотя бы один getVariants завершился ошибкой', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(
                    jsonResponse({ data: [{ roomCategoryID: 10, date: today() }] }),
                )
                .mockRejectedValueOnce(new Error('FrontDesk24 timeout')),
        );

        const result = await readShelterOccupancy(
            'public-widget-token',
            [{ categoryId: 10, totalRooms: 2 }],
            1,
        );

        expect(result.sourceComplete).toBe(false);
        expect(result.confirmedEmpty).toBe(false);
        expect(result.failedProbes).toBe(1);
    });

    it('не подтверждает пустоту без горизонта хотя бы одной категории', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })));

        const result = await readShelterOccupancy(
            'public-widget-token',
            [{ categoryId: 10, totalRooms: 2 }],
            1,
        );

        expect(result.sourceComplete).toBe(false);
        expect(result.confirmedEmpty).toBe(false);
        expect(result.failedProbes).toBe(1);
    });
});
