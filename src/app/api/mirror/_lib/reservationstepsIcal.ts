// Читалка занятости из публичных iCal платформы reservationsteps/Bnovo
// (Аврора Inn и другие объекты этой платформы). Токен не нужен: .ics по
// id категории раздаётся публично.
//
// Семантика проверена на живом фиде: SUMMARY = «RoomId: {id категории} - Room
// not available», то есть событие означает «в ЭТОЙ КАТЕГОРИИ нет свободных
// номеров» на интервал DTSTART..DTEND (DTEND — день выезда, не занят).
// Частичную занятость категории источник не отдаёт вовсе.

import { withRetry } from '@/app/api/yandex-backend/_lib/retry';

const ICAL_URL = 'https://public-api.reservationsteps.ru/v1/api/ical';

// Ленты reservationsteps периодически отвечают сетевой ошибкой или 5xx.
// Раньше одна такая осечка делала ответ источника неполным, и синхронизация
// ВСЕГО отеля отменялась: у «Грасс» из-за этого занятость не обновлялась
// часами (в журнале — «Источник iCal вернул неполный ответ»). Временные сбои
// повторяем, постоянные (404/403 — ленту удалили или закрыли) не повторяем:
// там повтор ничего не изменит, и это честная неполнота ответа.
const ICAL_TIMEOUT_MS = 20_000;
const ICAL_RETRIES = 2;
const ICAL_RETRY_DELAY_MS = 300;

const fetchIcalText = async (icalId: number): Promise<string | null> => {
    try {
        return await withRetry(
            async () => {
                const response = await fetch(`${ICAL_URL}/${icalId}`, {
                    cache: 'no-store',
                    signal: AbortSignal.timeout(ICAL_TIMEOUT_MS),
                });
                if (!response.ok) {
                    // Статус кладём в ошибку: withRetry сам решит, временный он или нет.
                    const error = Object.assign(
                        new Error(`iCal ${icalId}: HTTP ${response.status}`),
                        { status: response.status },
                    );
                    throw error;
                }
                return await response.text();
            },
            { retries: ICAL_RETRIES, baseDelayMs: ICAL_RETRY_DELAY_MS },
        );
    } catch {
        return null;
    }
};

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

export type IcalOccupancyReadResult = {
    categories: IcalCategoryOccupancy[];
    sourceComplete: boolean;
    confirmedEmpty: boolean;
    failedCategoryIds: number[];
};

// Заезд 14:00 МСК = 11:00 UTC, выезд 12:00 МСК = 09:00 UTC.
const checkinUnix = (date: Date) =>
    Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 11) / 1000);
const checkoutUnix = (date: Date) =>
    Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 9) / 1000);

const parseIcsDate = (raw: string) =>
    new Date(
        Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8))),
    );

const parseEvents = (ics: string): Array<{ from: Date; to: Date }> | null => {
    if (!ics.includes('BEGIN:VCALENDAR') || !ics.includes('END:VCALENDAR')) {
        return null;
    }
    const events: Array<{ from: Date; to: Date }> = [];
    for (const block of ics.split('BEGIN:VEVENT').slice(1)) {
        const start = /DTSTART[^:]*:(\d{8})/.exec(block);
        const end = /DTEND[^:]*:(\d{8})/.exec(block);
        if (!start || !end) return null;
        events.push({ from: parseIcsDate(start[1]), to: parseIcsDate(end[1]) });
    }
    return events;
};

export const readIcalOccupancy = async (
    categories: Array<{ icalId: number }>,
    horizonDays = 365,
): Promise<IcalOccupancyReadResult> => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + horizonDays);

    const results = await Promise.all(
        categories.map(async (category) => {
            try {
                const text = await fetchIcalText(category.icalId);
                if (text === null) {
                    return {
                        occupancy: { icalId: category.icalId, intervals: [] },
                        complete: false,
                    };
                }

                const events = parseEvents(text);
                if (events === null) {
                    return {
                        occupancy: { icalId: category.icalId, intervals: [] },
                        complete: false,
                    };
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

                return {
                    occupancy: { icalId: category.icalId, intervals },
                    complete: true,
                };
            } catch {
                return {
                    occupancy: { icalId: category.icalId, intervals: [] },
                    complete: false,
                };
            }
        }),
    );

    const failedCategoryIds = results
        .filter((result) => !result.complete)
        .map((result) => result.occupancy.icalId);
    const sourceComplete = failedCategoryIds.length === 0;
    const occupancy = results.map((result) => result.occupancy);

    return {
        categories: occupancy,
        sourceComplete,
        confirmedEmpty:
            sourceComplete && occupancy.every((category) => category.intervals.length === 0),
        failedCategoryIds,
    };
};
