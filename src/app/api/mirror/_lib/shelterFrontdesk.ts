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

// Ночной индекс даты: заезд 14:00 МСК = 11:00 UTC, floor(/86400) = номер суток UTC.
const nightIndexOfDate = (date: Date) =>
    Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 11) / 1000 / NIGHT);

const nightToDate = (night: number) => new Date(night * NIGHT * 1000);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const fetchFreeDates = async (
    token: string,
    dateFrom: string,
    dateTo: string,
): Promise<Array<{ categoryId: number; night: number }>> => {
    const response = await fetch(FD_AVAILABLE_DATES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ token, language: 'ru', dateFrom, dateTo, currency: 'RUB' }),
    });
    if (!response.ok) {
        throw new Error(`FrontDesk24 getAvailableDates: ${response.status}`);
    }
    const json = (await response.json()) as {
        data?: Array<{ roomCategoryID: number; date: string }>;
    };
    return (json?.data ?? []).map((rec) => ({
        categoryId: rec.roomCategoryID,
        night: nightIndexOfDate(new Date(`${rec.date}T00:00:00Z`)),
    }));
};

const fetchAvailableRooms = async (
    token: string,
    dateFrom: string,
    dateTo: string,
): Promise<Map<number, number>> => {
    const response = await fetch(FD_VARIANTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
            token,
            language: 'ru',
            dateFrom,
            dateTo,
            currency: 'RUB',
            rooms: [{ adults: 2, children: [] }],
            onlyRostourismProgram: 0,
        }),
    });
    if (!response.ok) {
        throw new Error(`FrontDesk24 getVariants: ${response.status}`);
    }
    const json = (await response.json()) as {
        data?: Array<Array<{ id: number; availableRooms?: number }>>;
    };
    const out = new Map<number, number>();
    for (const item of json?.data?.[0] ?? []) out.set(item.id, item.availableRooms ?? 0);
    return out;
};

export const readShelterOccupancy = async (
    token: string,
    categories: Array<{ categoryId: number; totalRooms: number }>,
    horizonDays = 365,
): Promise<CategoryOccupancy[]> => {
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
    const freeNightsUnion = new Set<number>();
    for (const { categoryId, night } of await fetchFreeDates(token, isoDate(today), isoDate(end))) {
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
                return { night, avail: await fetchAvailableRooms(token, isoDate(day), isoDate(next)) };
            }),
        );
        for (const { night, avail } of results) availByNightCat.set(night, avail);
    }

    // 3) Занятость по дням: несвободный день (в горизонте) — всё занято; свободный —
    //    всего минус число свободных (если не знаем — считаем полностью свободным).
    return categories.map((category) => {
        const free = freeByCat.get(category.categoryId)!;
        const maxNight = maxNightByCat.get(category.categoryId)!;
        const occupiedByNight = new Map<number, number>();
        for (let night = todayNight; night <= maxNight; night += 1) {
            let occupied: number;
            if (free.has(night)) {
                const availableRooms = availByNightCat.get(night)?.get(category.categoryId) ?? category.totalRooms;
                occupied = Math.max(0, Math.min(category.totalRooms, category.totalRooms - availableRooms));
            } else {
                occupied = category.totalRooms;
            }
            occupiedByNight.set(night, occupied);
        }
        return { categoryId: category.categoryId, totalRooms: category.totalRooms, occupiedByNight };
    });
};
