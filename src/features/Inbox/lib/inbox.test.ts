import { describe, expect, it } from 'vitest';

import {
    channelName,
    counts,
    filterRows,
    formatMoment,
    humanWait,
    isOverdue,
    lastSpeaker,
    waitingHours,
    type InboxRow,
} from './inbox';

const NOW = Date.parse('2026-09-12T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const row = (extra: Partial<InboxRow> = {}): InboxRow => ({
    messenger_id: 1,
    client_id: 'c1',
    client_name: 'Анна',
    client_phones: ['+79001234567'],
    is_temporary: false,
    oko_client_id: null,
    integration_id: 30,
    last_text: 'здравствуйте',
    last_direction: 'in',
    last_author_type: 'contact',
    last_at: hoursAgo(2),
    waiting_since: hoursAgo(2),
    deal_id: 'd1',
    deal_stage: 'podbor',
    ...extra,
});

describe('ожидание ответа', () => {
    it('считается только когда последним писал клиент', () => {
        expect(waitingHours(row(), NOW)).toBeCloseTo(2, 5);
        expect(waitingHours(row({ waiting_since: null, last_direction: 'out' }), NOW)).toBeNull();
    });

    it('часы клиента впереди серверных — ожидание не уходит в минус', () => {
        expect(waitingHours(row({ waiting_since: hoursAgo(-3) }), NOW)).toBe(0);
    });

    it('зависшим считается чат старше часа', () => {
        expect(isOverdue(row({ waiting_since: hoursAgo(0.5) }), NOW)).toBe(false);
        expect(isOverdue(row({ waiting_since: hoursAgo(1) }), NOW)).toBe(true);
        expect(isOverdue(row({ waiting_since: null }), NOW)).toBe(false);
    });

    it('человеческое время ожидания', () => {
        expect(humanWait(0.3)).toBe('18 мин');
        expect(humanWait(1)).toBe('1 ч');
        expect(humanWait(2.25)).toBe('2 ч 15 мин');
        expect(humanWait(0.001)).toBe('1 мин');
    });

    it('дни в правильном падеже и без скачка на границе суток', () => {
        expect(humanWait(23.9)).toBe('23 ч 54 мин');
        expect(humanWait(24)).toBe('1 день');
        expect(humanWait(50)).toBe('2 дня');
        expect(humanWait(24 * 5)).toBe('5 дней');
        expect(humanWait(24 * 11)).toBe('11 дней');
        expect(humanWait(24 * 21)).toBe('21 день');
    });
});

describe('отборы и счётчики', () => {
    const rows = [
        row({ messenger_id: 1, waiting_since: hoursAgo(3) }), // зависший
        row({ messenger_id: 2, waiting_since: hoursAgo(0.2) }), // ждёт, но недолго
        row({ messenger_id: 3, waiting_since: null, last_direction: 'out' }), // ответили
        row({ messenger_id: 4, waiting_since: hoursAgo(5), client_id: null, client_name: null, is_temporary: true }),
    ];

    it('отбирает по виду', () => {
        expect(filterRows(rows, 'waiting', NOW).map((r) => r.messenger_id)).toEqual([1, 2, 4]);
        expect(filterRows(rows, 'overdue', NOW).map((r) => r.messenger_id)).toEqual([1, 4]);
        expect(filterRows(rows, 'unknown', NOW).map((r) => r.messenger_id)).toEqual([4]);
        expect(filterRows(rows, 'all', NOW)).toHaveLength(4);
    });

    it('в «Без клиента» попадают и временные карточки, и чаты вовсе без клиента', () => {
        const temporary = row({ messenger_id: 5, client_id: 'c5', is_temporary: true });
        const orphan = row({ messenger_id: 6, client_id: null, is_temporary: false });
        expect(filterRows([temporary, orphan], 'unknown', NOW).map((r) => r.messenger_id)).toEqual([5, 6]);
    });

    it('считает для шапки', () => {
        expect(counts(rows, NOW)).toEqual({ all: 4, waiting: 3, overdue: 2, unknown: 1 });
    });

    it('пустой список не ломает отборы и счётчики', () => {
        expect(filterRows([], 'overdue', NOW)).toEqual([]);
        expect(counts([], NOW)).toEqual({ all: 0, waiting: 0, overdue: 0, unknown: 0 });
    });
});

describe('мелочи', () => {
    it('кто говорил последним: робот-автоответчик не выдаётся за нас', () => {
        expect(lastSpeaker({ last_direction: 'in', last_author_type: 'contact' })).toBe('клиент');
        expect(lastSpeaker({ last_direction: 'out', last_author_type: 'user' })).toBe('мы');
        expect(lastSpeaker({ last_direction: 'out', last_author_type: 'robot' })).toBe('робот');
        expect(lastSpeaker({ last_direction: 'out', last_author_type: null })).toBe('мы');
    });

    it('называет каналы по номеру подключения', () => {
        expect(channelName(30)).toBe('Avito');
        expect(channelName(70)).toBe('WhatsApp');
        expect(channelName(999)).toBe('канал 999');
        expect(channelName(null)).toBe('—');
    });

    it('показывает момент письма по Москве, а не по часам компьютера', () => {
        // База отдаёт время в UTC; менеджер должен видеть московское.
        expect(formatMoment('2026-09-12T09:05:00Z')).toBe('12.09 12:05');
        // Переход через полночь по Москве меняет и дату.
        expect(formatMoment('2026-09-12T22:30:00Z')).toBe('13.09 01:30');
    });
});
