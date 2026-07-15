import { describe, expect, it } from 'vitest';

import { parseIcalEvents, parseIcalValue, unfoldIcalLines } from '@/app/api/realtycalendar/_lib/icalParse';
import { toMoscowStayUnix } from '@/app/api/realtycalendar/_lib/moscowTime';

const ical = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;

describe('unfoldIcalLines', () => {
    it('склеивает перенесённые строки (продолжение с пробела)', () => {
        const text = 'SUMMARY:Long\r\n  tail\r\nUID:1';
        expect(unfoldIcalLines(text)).toEqual(['SUMMARY:Long tail', 'UID:1']);
    });
});

describe('parseIcalValue', () => {
    it('разбирает ключ и значение, отбрасывая параметры после ;', () => {
        expect(parseIcalValue('DTSTART;VALUE=DATE:20260720')).toEqual({
            key: 'DTSTART',
            value: '20260720',
        });
    });

    it('строка без двоеточия — null', () => {
        expect(parseIcalValue('BROKEN')).toBeNull();
    });
});

describe('parseIcalEvents', () => {
    it('разбирает событие в московские границы 14:00/12:00', () => {
        const text = ical(
            'BEGIN:VEVENT\r\nUID:evt-1\r\nDTSTART;VALUE=DATE:20260720\r\nDTEND;VALUE=DATE:20260725\r\nSUMMARY:Иванов\r\nEND:VEVENT',
        );
        const events = parseIcalEvents(text);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            uid: 'evt-1',
            start: toMoscowStayUnix(2026, 7, 20, false),
            end: toMoscowStayUnix(2026, 7, 25, true),
            summary: 'Иванов',
        });
    });

    it('без UID генерирует стабильный sha256-хэш (64 hex)', () => {
        const text = ical(
            'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260720\r\nDTEND;VALUE=DATE:20260725\r\nEND:VEVENT',
        );
        const first = parseIcalEvents(text);
        const second = parseIcalEvents(text);
        expect(first[0].uid).toMatch(/^[0-9a-f]{64}$/);
        expect(first[0].uid).toBe(second[0].uid);
    });

    it('отбрасывает события с концом не позже начала', () => {
        const text = ical(
            'BEGIN:VEVENT\r\nUID:bad\r\nDTSTART;VALUE=DATE:20260725\r\nDTEND;VALUE=DATE:20260720\r\nEND:VEVENT',
        );
        expect(parseIcalEvents(text)).toEqual([]);
    });

    it('снимает экранирование в тексте', () => {
        const text = ical(
            'BEGIN:VEVENT\r\nUID:e\r\nDTSTART;VALUE=DATE:20260720\r\nDTEND;VALUE=DATE:20260725\r\nSUMMARY:Петров\\, семья\r\nEND:VEVENT',
        );
        expect(parseIcalEvents(text)[0].summary).toBe('Петров, семья');
    });

    it('разбирает несколько событий', () => {
        const text = ical(
            'BEGIN:VEVENT\r\nUID:a\r\nDTSTART;VALUE=DATE:20260720\r\nDTEND;VALUE=DATE:20260722\r\nEND:VEVENT\r\n' +
                'BEGIN:VEVENT\r\nUID:b\r\nDTSTART;VALUE=DATE:20260801\r\nDTEND;VALUE=DATE:20260805\r\nEND:VEVENT',
        );
        expect(parseIcalEvents(text).map((e) => e.uid)).toEqual(['a', 'b']);
    });
});
