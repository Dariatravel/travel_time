import { DEFAULT_CITIES } from './_shared/chessmate.ts';

export type ManagerQuery = {
    startDate: string;
    endDate: string;
    cities: string[];
    guests: number | null;
    /** Заезд уже прошёл: ответ будет про прошлое, менеджера надо предупредить. */
    isPast: boolean;
};

const MONTHS: Record<string, number> = {
    январ: 1,
    феврал: 2,
    март: 3,
    апрел: 4,
    ма: 5,
    июн: 6,
    июл: 7,
    август: 8,
    сентябр: 9,
    октябр: 10,
    ноябр: 11,
    декабр: 12,
};

const normalize = (text: string) => text.toLowerCase().replaceAll('ё', 'е');

const monthFromWord = (text: string, fromIndex: number): number | null => {
    const tail = text.slice(fromIndex);

    for (const [root, month] of Object.entries(MONTHS)) {
        if (root === 'ма') continue;
        if (new RegExp(`^\\s*${root}`).test(tail)) return month;
    }

    return /^\s*ма[йя]/.test(tail) ? 5 : null;
};

const pad = (value: number) => String(value).padStart(2, '0');
const toIso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

const isValidDate = (year: number, month: number, day: number) => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;

    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const guessYear = (month: number, day: number, today: Date) => {
    const year = today.getUTCFullYear();
    const candidate = Date.UTC(year, month - 1, day);
    const monthAgo = today.getTime() - 31 * 24 * 60 * 60 * 1000;

    return candidate < monthAgo ? year + 1 : year;
};

type ParsedDay = { day: number; month: number | null; year: number | null };

const parseDates = (text: string, today: Date): { start: string; end: string } | null => {
    const pattern =
        /(\d{1,2})(?:[.,/](\d{1,2}))?(?:[.,/](\d{2,4}))?\s*(?:-|–|—|по|до)\s*(\d{1,2})(?:[.,/](\d{1,2}))?(?:[.,/](\d{2,4}))?/;
    const match = pattern.exec(text);
    if (!match) return null;

    const [, d1, m1, y1, d2, m2, y2] = match;
    const first: ParsedDay = {
        day: Number(d1),
        month: m1 ? Number(m1) : null,
        year: y1 ? Number(y1) : null,
    };
    const second: ParsedDay = {
        day: Number(d2),
        month: m2 ? Number(m2) : null,
        year: y2 ? Number(y2) : null,
    };

    const wordMonth = monthFromWord(text, match.index + match[0].length);
    if (wordMonth) {
        second.month ??= wordMonth;
        first.month ??= wordMonth;
    }

    first.month ??= second.month;
    second.month ??= first.month;
    if (!first.month || !second.month) return null;

    const startYear = first.year ?? guessYear(first.month, first.day, today);
    const endYear = second.year ?? (second.month < first.month ? startYear + 1 : startYear);

    if (!isValidDate(startYear, first.month, first.day)) return null;
    if (!isValidDate(endYear, second.month, second.day)) return null;

    const start = toIso(startYear, first.month, first.day);
    const end = toIso(endYear, second.month, second.day);

    return start < end ? { start, end } : null;
};

const DAY = 24 * 60 * 60 * 1000;

const isoOf = (date: Date) => date.toISOString().slice(0, 10);
const shift = (date: Date, days: number) => new Date(date.getTime() + days * DAY);

/**
 * Живые формулировки менеджеров: «сегодня», «завтра», «на выходные», «на неделю».
 * Считаем от московской даты — менеджеры работают по ней, и «завтра» не должно
 * зависеть от часового пояса сервера.
 */
const parseRelativeDates = (text: string, today: Date): { start: string; end: string } | null => {
    const moscowToday = new Date(`${new Date(today.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)}T00:00:00Z`);

    // «на 3 ночи», «на 5 дней» — от сегодня, если не сказано иное.
    const nights = /на\s+(\d{1,2})\s*(ноч|дн|сут)/.exec(text);

    const startFrom = (from: Date, defaultNights: number) => ({
        start: isoOf(from),
        end: isoOf(shift(from, nights ? Number(nights[1]) : defaultNights)),
    });

    if (/послезавтра/.test(text)) return startFrom(shift(moscowToday, 2), 1);
    if (/завтра/.test(text)) return startFrom(shift(moscowToday, 1), 1);

    if (/выходн/.test(text)) {
        // Ближайшая пятница (или сегодня, если уже пятница), выезд в воскресенье.
        const weekday = moscowToday.getUTCDay(); // 0 — воскресенье
        const daysToFriday = (5 - weekday + 7) % 7;
        const friday = shift(moscowToday, daysToFriday);

        return { start: isoOf(friday), end: isoOf(shift(friday, 2)) };
    }

    if (/на\s+недел|неделю/.test(text)) return startFrom(moscowToday, 7);
    if (/сегодня|сейчас|ближайш/.test(text)) return startFrom(moscowToday, nights ? 0 : 3);
    if (nights) return startFrom(moscowToday, 0);

    return null;
};

const CITY_STEMS: Record<string, string[]> = {
    gagra: ['гагр'],
    pitsunda: ['пицунд'],
    ldzaa: ['лдзаа', 'лидзав'],
    alahadzy: ['алахадз'],
    candripsh: ['цандрипш'],
    gudauta: ['гудаут'],
    'new-athon': ['афон'],
    sukhumi: ['сухум'],
};

const ALL_CITIES_HINTS = ['везде', 'все города', 'всем городам', 'вся абхазия', 'по абхазии'];

const parseCities = (text: string): string[] => {
    if (ALL_CITIES_HINTS.some((hint) => text.includes(hint))) {
        return DEFAULT_CITIES.map((city) => city.value);
    }

    return DEFAULT_CITIES.filter((city) =>
        (CITY_STEMS[city.value] ?? [normalize(city.label)]).some((stem) => text.includes(stem)),
    ).map((city) => city.value);
};

const parseGuests = (text: string): number | null => {
    const match = /(\d{1,2})\s*(?:чел|гост|человек|взросл|-?х|-?местн)/.exec(text);
    if (!match) return null;

    const guests = Number(match[1]);

    return guests >= 1 && guests <= 20 ? guests : null;
};

export const parseManagerQuery = (rawText: string, today = new Date()): ManagerQuery | null => {
    const text = normalize(rawText)
        .replace(/^\/\S+\s*/, '')
        .trim();
    if (!text) return null;

    // Точные даты важнее: «завтра-послезавтра еду, нужно 20-25 августа».
    const dates = parseDates(text, today) ?? parseRelativeDates(text, today);
    if (!dates) return null;

    const withoutDates = text.replace(
        /(\d{1,2})(?:[.,/](\d{1,2}))?(?:[.,/](\d{2,4}))?\s*(?:-|–|—|по|до)\s*(\d{1,2})(?:[.,/](\d{1,2}))?(?:[.,/](\d{2,4}))?/,
        ' ',
    );

    // Сравниваем с московской датой: до 3 часов ночи по Москве сервер ещё во
    // вчерашнем дне по UTC, и сегодняшний заезд иначе считался бы прошедшим.
    const moscowToday = new Date(today.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

    return {
        startDate: dates.start,
        endDate: dates.end,
        cities: parseCities(text),
        guests: parseGuests(withoutDates),
        isPast: dates.start < moscowToday,
    };
};
