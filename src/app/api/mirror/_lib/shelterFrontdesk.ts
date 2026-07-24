// Читалка занятости из Shelter/FrontDesk24 (публичный API виджета).
// getVariants на конкретную ночь отдаёт по каждой категории availableRooms
// (сколько номеров свободно). Занято = всего номеров − свободно.
// Данных «сколько занято» цельным запросом нет — опрашиваем по дням.

const FD_API = 'https://pms.frontdesk24.ru/api/online/getVariants';
const NIGHT = 86400;
const FETCH_BATCH = 8; // параллельных запросов за раз, чтобы не грузить чужой сервис

export type CategoryOccupancy = {
    categoryId: number;
    totalRooms: number;
    /** индекс ночи floor(unix/86400) → сколько номеров занято у отельера */
    occupiedByNight: Map<number, number>;
};

// Ночной индекс даты: заезд 14:00 МСК = 11:00 UTC, floor(/86400) = номер суток UTC.
const nightIndexOfDate = (date: Date) =>
    Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 11) / 1000 / NIGHT);

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const fetchAvailableRooms = async (
    token: string,
    dateFrom: string,
    dateTo: string,
): Promise<Map<number, number>> => {
    const response = await fetch(FD_API, {
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
    const list = json?.data?.[0] ?? [];
    const out = new Map<number, number>();
    for (const item of list) {
        out.set(item.id, item.availableRooms ?? 0);
    }
    return out;
};

export const readShelterOccupancy = async (
    token: string,
    categories: Array<{ categoryId: number; totalRooms: number }>,
    horizonDays = 365,
): Promise<CategoryOccupancy[]> => {
    const occByCat = new Map<number, Map<number, number>>();
    for (const category of categories) {
        occByCat.set(category.categoryId, new Map());
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const days = Array.from({ length: horizonDays }, (_, index) => {
        const day = new Date(today);
        day.setUTCDate(day.getUTCDate() + index);
        return day;
    });

    for (let start = 0; start < days.length; start += FETCH_BATCH) {
        const chunk = days.slice(start, start + FETCH_BATCH);
        const results = await Promise.all(
            chunk.map(async (day) => {
                const next = new Date(day);
                next.setUTCDate(next.getUTCDate() + 1);
                const avail = await fetchAvailableRooms(token, isoDate(day), isoDate(next));
                return { day, avail };
            }),
        );

        for (const { day, avail } of results) {
            const night = nightIndexOfDate(day);
            for (const category of categories) {
                const free = avail.get(category.categoryId) ?? category.totalRooms;
                const occupied = Math.max(0, Math.min(category.totalRooms, category.totalRooms - free));
                occByCat.get(category.categoryId)!.set(night, occupied);
            }
        }
    }

    return categories.map((category) => ({
        categoryId: category.categoryId,
        totalRooms: category.totalRooms,
        occupiedByNight: occByCat.get(category.categoryId)!,
    }));
};
