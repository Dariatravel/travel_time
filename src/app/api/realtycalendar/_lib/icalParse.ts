import { createHash } from 'crypto';

import { toMoscowStayUnix } from '@/app/api/realtycalendar/_lib/moscowTime';

/**
 * Чистый разбор iCalendar-фида в события брони. Вынесен из syncIcalFeeds,
 * чтобы логику парсинга можно было покрыть тестами без Supabase-клиента.
 *
 * Даты трактуются как ночёвки по Москве: DTSTART -> заезд 14:00, DTEND ->
 * выезд 12:00 (toMoscowStayUnix), поэтому границы совпадают с бронями
 * менеджеров и вебхуком.
 */
export type ParsedIcalEvent = {
    uid: string;
    start: number;
    end: number;
    summary?: string;
    description?: string;
};

/** Разворачивает перенесённые строки iCal (RFC 5545: продолжение строки начинается с пробела/таба). */
export const unfoldIcalLines = (icalText: string): string[] => {
    return icalText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .reduce<string[]>((lines, line) => {
            if (/^[ \t]/.test(line) && lines.length > 0) {
                lines[lines.length - 1] += line.slice(1);
            } else {
                lines.push(line);
            }
            return lines;
        }, []);
};

export const parseIcalValue = (line: string): { key: string; value: string } | null => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) return null;

    const key = line.slice(0, separatorIndex).split(';')[0].toUpperCase();
    const value = line.slice(separatorIndex + 1);

    return { key, value };
};

const unescapeIcalText = (value?: string) => {
    if (!value) return undefined;

    return value
        .replace(/\\n/gi, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\')
        .trim();
};

const toNoonUnixFromIcalDate = (value: string, endOfStay: boolean) => {
    const dateMatch = value.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!dateMatch) return null;

    const [, year, month, day] = dateMatch;

    return toMoscowStayUnix(Number(year), Number(month), Number(day), endOfStay);
};

const hashEventUid = (seed: string) => {
    return createHash('sha256').update(seed).digest('hex');
};

export const parseIcalEvents = (icalText: string): ParsedIcalEvent[] => {
    const lines = unfoldIcalLines(icalText);
    const events: Record<string, string>[] = [];
    let currentEvent: Record<string, string> | null = null;

    lines.forEach((line) => {
        const normalizedLine = line.trim();

        if (normalizedLine === 'BEGIN:VEVENT') {
            currentEvent = {};
            return;
        }

        if (normalizedLine === 'END:VEVENT') {
            if (currentEvent) {
                events.push(currentEvent);
            }
            currentEvent = null;
            return;
        }

        if (!currentEvent) return;

        const parsed = parseIcalValue(normalizedLine);
        if (!parsed) return;

        currentEvent[parsed.key] = parsed.value;
    });

    return events.flatMap((event) => {
        const start = event.DTSTART ? toNoonUnixFromIcalDate(event.DTSTART, false) : null;
        const end = event.DTEND ? toNoonUnixFromIcalDate(event.DTEND, true) : null;

        if (!start || !end || end <= start) {
            return [];
        }

        const uid = event.UID || hashEventUid(`${event.DTSTART}:${event.DTEND}:${event.SUMMARY ?? ''}`);

        return [
            {
                uid,
                start,
                end,
                summary: unescapeIcalText(event.SUMMARY),
                description: unescapeIcalText(event.DESCRIPTION),
            },
        ];
    });
};
