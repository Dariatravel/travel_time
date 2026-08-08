// Читалка занятости из публичных iCal платформы reservationsteps/Bnovo
// (Аврора Inn и другие объекты этой платформы). Токен не нужен: .ics по
// id категории раздаётся публично.
//
// Семантика проверена на живом фиде: SUMMARY = «RoomId: {id категории} - Room
// not available», то есть событие означает «в ЭТОЙ КАТЕГОРИИ нет свободных
// номеров» на интервал DTSTART..DTEND (DTEND — день выезда, не занят).
// Частичную занятость категории источник не отдаёт вовсе.

const ICAL_URL = 'https://public-api.reservationsteps.ru/v1/api/ical';

// Длинный интервал: либо реальная «категория занята целиком» (короткая бронь),
// либо закрытие продаж. Отличаем по началу: блок, начинающийся в ближайшие
// NEAR_BLOCK_DAYS (текущий сезон) — считаем занятостью (виджет показывает «нет
// мест»); длинный блок далёкого будущего (31.12 → след. год) — закрытие продаж,
// отсекаем. Короткие интервалы (<= SHORT_NIGHTS) — всегда реальные брони.
const SHORT_NIGHTS = 45;
const NEAR_BLOCK_DAYS = 90;
const DAY_MS = 86_400_000;

export type IcalCategoryOccupancy = {
    icalId: number;
    /** Интервалы «категория занята целиком»: unix-секунды заезда/выезда по МСК. */
    intervals: Array<{ start: number; end: number }>;
};

// Заезд 14:00 МСК = 11:00 UTC, выезд 12:00 МСК = 09:00 UTC.
const checkinUnix = (date: Date) =>
    Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 11) / 1000);
const checkoutUnix = (date: Date) =>
    Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 9) / 1000);

const parseIcsDate = (raw: string) =>
    new Date(Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8))));

const parseEvents = (ics: string): Array<{ from: Date; to: Date }> => {
    const events: Array<{ from: Date; to: Date }> = [];
    for (const block of ics.split('BEGIN:VEVENT').slice(1)) {
        const start = /DTSTART[^:]*:(\d{8})/.exec(block);
        const end = /DTEND[^:]*:(\d{8})/.exec(block);
        if (!start || !end) continue;
        events.push({ from: parseIcsDate(start[1]), to: parseIcsDate(end[1]) });
    }
    return events;
};

export const readIcalOccupancy = async (
    categories: Array<{ icalId: number }>,
    horizonDays = 365,
): Promise<IcalCategoryOccupancy[]> => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + horizonDays);

    const results = await Promise.all(
        categories.map(async (category) => {
            let events: Array<{ from: Date; to: Date }> = [];
            try {
                const response = await fetch(`${ICAL_URL}/${category.icalId}`, { cache: 'no-store' });
                if (response.ok) {
                    events = parseEvents(await response.text());
                }
            } catch {
                // Недоступная категория не должна ломать остальные.
            }

            const nearLimit = new Date(today.getTime() + NEAR_BLOCK_DAYS * DAY_MS);
            const intervals = events
                .filter((event) => {
                    if (event.to <= today) return false;
                    if (event.from > horizon) return false;
                    const nights = (event.to.getTime() - event.from.getTime()) / DAY_MS;
                    if (nights <= SHORT_NIGHTS) return true;
                    // длинный блок: берём только начинающийся в текущем сезоне
                    return event.from <= nearLimit;
                })
                .map((event) => ({
                    start: checkinUnix(event.from < today ? today : event.from),
                    end: checkoutUnix(event.to),
                }))
                .filter((interval) => interval.start < interval.end);

            return { icalId: category.icalId, intervals };
        }),
    );

    return results;
};
