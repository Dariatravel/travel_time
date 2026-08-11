/**
 * Разбор запроса менеджера, написанного обычным текстом.
 *
 * Менеджеры пишут в чат по-человечески: «Гагра 12-16 августа 4 человека»,
 * «с 12 по 16.08 Пицунда», «12.08-16.08». Бот должен понимать такие фразы,
 * а не требовать строгий формат команды.
 */

import { DEFAULT_CITIES } from '@/features/AdvancedFilters/lib/constants';

export type ManagerQuery = {
    /** Дата заезда, YYYY-MM-DD. */
    startDate: string;
    /** Дата выезда, YYYY-MM-DD. */
    endDate: string;
    /** Слаги городов (пусто — искать везде). */
    cities: string[];
    /** Сколько гостей, если указано. */
    guests: number | null;
};

const MONTHS: Record<string, number> = {
    январ: 1,
    феврал: 2,
    март: 3,
    апрел: 4,
    ма: 5, // «мая», «май» — проверяется последним из-за короткого корня
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

/**
 * Год не указывают почти никогда. Берём текущий, а если дата уже прошла
 * больше месяца назад — считаем, что речь о следующем годе.
 */
const guessYear = (month: number, day: number, today: Date) => {
    const year = today.getUTCFullYear();
    const candidate = Date.UTC(year, month - 1, day);
    const monthAgo = today.getTime() - 31 * 24 * 60 * 60 * 1000;

    return candidate < monthAgo ? year + 1 : year;
};

type ParsedDay = { day: number; month: number | null; year: number | null };

const parseDates = (text: string, today: Date): { start: string; end: string } | null => {
    // «12.08.2026 - 16.08.2026», «12.08-16.08», «12-16 августа», «с 12 по 16 августа»
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

    // Месяц словом после дат: «12-16 августа» → оба месяца августовские.
    const wordMonth = monthFromWord(text, match.index + match[0].length);
    if (wordMonth) {
        second.month ??= wordMonth;
        first.month ??= wordMonth;
    }

    // «12.08-16» — второй день в том же месяце, что и первый, и наоборот.
    first.month ??= second.month;
    second.month ??= first.month;

    if (!first.month || !second.month) return null;

    const startYear = first.year ?? guessYear(first.month, first.day, today);
    // Период через новый год: «28.12-04.01» — выезд в следующем году. Внутри
    // одного месяца год не переносим: «16.08-12.08» — это опечатка менеджера,
    // а не бронь на год, и ниже она отсеется проверкой start < end.
    const endYear = second.year ?? (second.month < first.month ? startYear + 1 : startYear);

    if (!isValidDate(startYear, first.month, first.day)) return null;
    if (!isValidDate(endYear, second.month, second.day)) return null;

    const start = toIso(startYear, first.month, first.day);
    const end = toIso(endYear, second.month, second.day);

    return start < end ? { start, end } : null;
};

const parseCities = (text: string): string[] => {
    const cities = new Set<string>();

    for (const city of DEFAULT_CITIES) {
        // Хватает первых пяти букв: «гагра/гагре/гагры», «пицунда/пицунде».
        const root = normalize(city.label).slice(0, 5);
        if (root.length >= 3 && text.includes(root)) {
            cities.add(city.value);
        }
    }

    // «Афон» пишут и без «Новый», «Лидзава» — местное название Лдзаа.
    if (text.includes('афон')) cities.add('new-athon');
    if (text.includes('лидзав') || text.includes('лдзаа')) cities.add('ldzaa');

    return Array.from(cities);
};

const parseGuests = (text: string): number | null => {
    const match = /(\d{1,2})\s*(?:чел|гост|человек|взросл|-?х|-?местн)/.exec(text);
    if (!match) return null;

    const guests = Number(match[1]);

    return guests >= 1 && guests <= 20 ? guests : null;
};

export const parseManagerQuery = (rawText: string, today = new Date()): ManagerQuery | null => {
    const text = normalize(rawText).replace(/^\/\S+\s*/, '').trim();
    if (!text) return null;

    const dates = parseDates(text, today);
    if (!dates) return null;

    // «4 человека» и дата «12-16» — цифры не должны мешать друг другу:
    // ищем гостей в тексте без уже разобранного куска с датами.
    const withoutDates = text.replace(
        /(\d{1,2})(?:[.,/](\d{1,2}))?(?:[.,/](\d{2,4}))?\s*(?:-|–|—|по|до)\s*(\d{1,2})(?:[.,/](\d{1,2}))?(?:[.,/](\d{2,4}))?/,
        ' ',
    );

    return {
        startDate: dates.start,
        endDate: dates.end,
        cities: parseCities(text),
        guests: parseGuests(withoutDates),
    };
};
