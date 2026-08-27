// Читалка занятости из Shelter/FrontDesk24 (публичный API виджета).
//
// getAvailableDates отдаёт СВОБОДНЫЕ даты по категориям одним запросом — это
// надёжный признак «свободно/занято» и границы календаря отеля. ВАЖНО:
// getVariants НЕ перечисляет полностью занятые категории (их просто нет в
// ответе), поэтому по одному getVariants занятые дни терялись бы. Схема:
//   1) getAvailableDates → свободные даты каждой категории + горизонт (макс. дата);
//   2) на СВОБОДНЫЕ дни getVariants → сколько номеров свободно (для многономерных);
//   3) занято = всего − свободно; на несвободный день внутри горизонта = всё занято;
//      за горизонтом (нет данных) — ничего не помечаем.

import { withRetry } from '@/app/api/yandex-backend/_lib/retry';

const FD_AVAILABLE_DATES = 'https://pms.frontdesk24.ru/api/online/getAvailableDates';
const FD_VARIANTS = 'https://pms.frontdesk24.ru/api/online/getVariants';
const NIGHT = 86400;
const FETCH_BATCH = 8;

export type CategoryOccupancy = {
    categoryId: number;
    totalRooms: number;
    /** индекс ночи floor(unix/86400) → сколько номеров занято у отельера */
    occupiedByNight: Map<number, number>;
};

export type ShelterOccupancyResult = {
    occupancy: CategoryOccupancy[];
    sourceComplete: boolean;
    confirmedEmpty: boolean;
    failedProbes: number;
};

// Ночной индекс даты: заезд 14:00 МСК = 11:00 UTC, floor(/86400) = номер суток UTC.
const nightIndexOfDate = (date: Date) =>
    Math.floor(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 11) / 1000 / NIGHT,
    );

const nightToDate = (night: number) => new Date(night * NIGHT * 1000);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

// FrontDesk24 опрашивается сотнями запросов (по одному на свободную дату), и
// одна случайная сетевая осечка делала ответ неполным — синхронизация отеля
// отменялась целиком. Ровно так «залипал» «Грасс» на iCal. Временные сбои
// повторяем, постоянные (4xx) — нет, там повтор ничего не изменит.
const FD_TIMEOUT_MS = 20_000;
const FD_RETRIES = 2;
const FD_RETRY_DELAY_MS = 300;

const postJson = async (url: string, body: unknown): Promise<Response> =>
    withRetry(
        async () => {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
                signal: AbortSignal.timeout(FD_TIMEOUT_MS),
                body: JSON.stringify(body),
            });
            if (response.status >= 500) {
                throw Object.assign(new Error(`FrontDesk24: HTTP ${response.status}`), {
                    status: response.status,
                });
            }
            return response;
        },
        { retries: FD_RETRIES, baseDelayMs: FD_RETRY_DELAY_MS },
    );

const fetchFreeDates = async (
    token: string,
    dateFrom: string,
    dateTo: string,
): Promise<Array<{ categoryId: number; night: number }>> => {
    const response = await postJson(FD_AVAILABLE_DATES, {
        token,
        language: 'ru',
        dateFrom,
        dateTo,
        currency: 'RUB',
    });
    if (!response.ok) {
        throw new Error(`FrontDesk24 getAvailableDates: ${response.status}`);
    }
    const json = (await response.json()) as {
        data?: unknown;
    };
    if (!Array.isArray(json?.data)) {
        throw new Error('FrontDesk24 getAvailableDates: некорректный ответ');
    }
    return json.data.map((value) => {
        const rec = value as { roomCategoryID?: unknown; date?: unknown };
        const categoryId = Number(rec.roomCategoryID);
        if (
            !Number.isInteger(categoryId) ||
            typeof rec.date !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(rec.date)
        ) {
            throw new Error('FrontDesk24 getAvailableDates: некорректная запись');
        }
        return {
            categoryId,
            night: nightIndexOfDate(new Date(`${rec.date}T00:00:00Z`)),
        };
    });
};

const fetchAvailableRooms = async (
    token: string,
    dateFrom: string,
    dateTo: string,
): Promise<Map<number, number>> => {
    const response = await postJson(FD_VARIANTS, {
        token,
        language: 'ru',
        dateFrom,
        dateTo,
        currency: 'RUB',
        rooms: [{ adults: 2, children: [] }],
        onlyRostourismProgram: 0,
    });
    if (!response.ok) {
        throw new Error(`FrontDesk24 getVariants: ${response.status}`);
    }
    const json = (await response.json()) as { data?: unknown };
    if (!Array.isArray(json?.data) || (json.data.length > 0 && !Array.isArray(json.data[0]))) {
        throw new Error('FrontDesk24 getVariants: некорректный ответ');
    }
    const out = new Map<number, number>();
    for (const value of (json.data[0] as unknown[] | undefined) ?? []) {
        const item = value as { id?: unknown; availableRooms?: unknown };
        const categoryId = Number(item.id);
        const availableRooms = item.availableRooms === undefined ? 0 : Number(item.availableRooms);
        if (!Number.isInteger(categoryId) || !Number.isFinite(availableRooms)) {
            throw new Error('FrontDesk24 getVariants: некорректная запись');
        }
        out.set(categoryId, availableRooms);
    }
    return out;
};

export const readShelterOccupancy = async (
    token: string,
    categories: Array<{ categoryId: number; totalRooms: number }>,
    horizonDays = 365,
): Promise<ShelterOccupancyResult> => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() + horizonDays);
    const todayNight = nightIndexOfDate(today);

    // 1) Свободные даты и горизонт по каждой категории.
    const wanted = new Set(categories.map((c) => c.categoryId));
    const freeByCat = new Map<number, Set<number>>();
    const maxNightByCat = new Map<number, number>();
    for (const category of categories) {
        freeByCat.set(category.categoryId, new Set());
        maxNightByCat.set(category.categoryId, todayNight - 1);
    }
    let failedProbes = 0;
    let freeDates: Array<{ categoryId: number; night: number }> = [];
    try {
        freeDates = await fetchFreeDates(token, isoDate(today), isoDate(end));
    } catch {
        failedProbes += 1;
    }

    const freeNightsUnion = new Set<number>();
    for (const { categoryId, night } of freeDates) {
        if (!wanted.has(categoryId)) continue;
        freeByCat.get(categoryId)!.add(night);
        freeNightsUnion.add(night);
        if (night > maxNightByCat.get(categoryId)!) maxNightByCat.set(categoryId, night);
    }

    // 2) Число свободных номеров на СВОБОДНЫЕ дни (нужно для многономерных).
    const availByNightCat = new Map<number, Map<number, number>>();
    const freeNights = [...freeNightsUnion].sort((a, b) => a - b);
    for (let i = 0; i < freeNights.length; i += FETCH_BATCH) {
        const chunk = freeNights.slice(i, i + FETCH_BATCH);
        const results = await Promise.all(
            chunk.map(async (night) => {
                const day = nightToDate(night);
                const next = new Date(day);
                next.setUTCDate(next.getUTCDate() + 1);
                try {
                    return {
                        night,
                        avail: await fetchAvailableRooms(token, isoDate(day), isoDate(next)),
                        complete: true,
                    };
                } catch {
                    return { night, avail: new Map<number, number>(), complete: false };
                }
            }),
        );
        for (const { night, avail, complete } of results) {
            if (!complete) failedProbes += 1;
            availByNightCat.set(night, avail);
        }
    }

    // 3) Занятость по дням: несвободный день (в горизонте) — всё занято; свободный —
    //    всего минус число свободных (если не знаем — считаем полностью свободным).
    const occupancy = categories.map((category) => {
        const free = freeByCat.get(category.categoryId)!;
        const maxNight = maxNightByCat.get(category.categoryId)!;
        if (maxNight < todayNight) failedProbes += 1;
        const occupiedByNight = new Map<number, number>();
        for (let night = todayNight; night <= maxNight; night += 1) {
            let occupied: number;
            if (free.has(night)) {
                const availableRooms =
                    availByNightCat.get(night)?.get(category.categoryId) ?? category.totalRooms;
                occupied = Math.max(
                    0,
                    Math.min(category.totalRooms, category.totalRooms - availableRooms),
                );
            } else {
                occupied = category.totalRooms;
            }
            occupiedByNight.set(night, occupied);
        }
        return {
            categoryId: category.categoryId,
            totalRooms: category.totalRooms,
            occupiedByNight,
        };
    });

    const sourceComplete = failedProbes === 0;
    const confirmedEmpty =
        sourceComplete &&
        occupancy.length > 0 &&
        occupancy.every(
            (category) =>
                category.occupiedByNight.size > 0 &&
                [...category.occupiedByNight.values()].every((occupied) => occupied === 0),
        );

    return { occupancy, sourceComplete, confirmedEmpty, failedProbes };
};
