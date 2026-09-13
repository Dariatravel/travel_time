import { describe, expect, it } from 'vitest';

import { batchChatIds, chatChecks, parseContactId, parseReadAt } from './chatChecks';
import type { OkoMessage } from './processEvent';

const NOW = Date.parse('2026-09-13T12:00:00Z');
const sec = (iso: string) => Date.parse(iso) / 1000;
const READ = sec('2026-09-13T11:30:00Z');

const msg = (id: number, chat: number, at: string | null): OkoMessage => ({
    id,
    contact_messenger_id: chat,
    created_at: at ? sec(at) : null,
    direction: 'incoming',
});

describe('отметка «сверка прочитала чат»', () => {
    it('чтение по контакту — все чаты пачки отмечаются временем запроса', () => {
        const checks = chatChecks(
            [msg(1, 100, '2026-09-13T09:00:00Z'), msg(2, 100, '2026-09-13T10:00:00Z'), msg(3, 200, '2026-09-12T08:00:00Z')],
            new Set(),
            READ,
            NOW,
        );
        expect(checks).toEqual([
            { messenger_id: 100, checked_at: '2026-09-13T11:30:00.000Z' },
            { messenger_id: 200, checked_at: '2026-09-13T11:30:00.000Z' },
        ]);
    });

    it('без времени запроса (чтение по сделке, старый скрипт) — ничего не отмечается', () => {
        // Время сообщения говорит, когда писали, а не когда мы смотрели.
        expect(chatChecks([msg(1, 100, '2026-09-13T10:00:00Z')], new Set(), null, NOW)).toEqual([]);
    });

    it('сообщение не записалось — его чат не отмечается: это мог быть ответ менеджера', () => {
        const checks = chatChecks(
            [msg(1, 100, null), msg(2, 100, null), msg(3, 200, null)],
            new Set([2]),
            READ,
            NOW,
        );
        expect(checks.map((c) => c.messenger_id)).toEqual([200]);
    });

    it('сообщение без своего номера — его чат не отмечается', () => {
        const noId = { contact_messenger_id: 100, created_at: READ } as OkoMessage;
        expect(chatChecks([msg(1, 100, null), noId, msg(3, 200, null)], new Set(), READ, NOW)).toEqual([
            { messenger_id: 200, checked_at: '2026-09-13T11:30:00.000Z' },
        ]);
    });

    it('сообщение без номера чата — не отмечается вся пачка: не знаем, чей это ответ', () => {
        const noChat = { id: 5, created_at: READ, direction: 'outgoing' } as OkoMessage;
        const fraction = { id: 6, contact_messenger_id: 1.5 } as OkoMessage;
        expect(chatChecks([msg(1, 100, null), noChat], new Set(), READ, NOW)).toEqual([]);
        expect(chatChecks([msg(1, 100, null), fraction], new Set(), READ, NOW)).toEqual([]);
    });

    it('пустая пачка — нечего отмечать', () => {
        expect(chatChecks([], new Set(), READ, NOW)).toEqual([]);
    });
});

describe('контакт ОКО и чаты пачки', () => {
    it('номер контакта — только целое положительное число', () => {
        expect(parseContactId(3272452)).toBe(3272452);
        for (const bad of ['3272452', 0, -1, 1.5, Number.NaN, null, undefined]) {
            expect(parseContactId(bad)).toBeNull();
        }
    });

    it('чаты пачки без повторов и мусора', () => {
        const junk = { id: 9, contact_messenger_id: 1.5 } as OkoMessage;
        expect(batchChatIds([msg(1, 100, null), msg(2, 100, null), msg(3, 200, null), junk])).toEqual([100, 200]);
    });
});

describe('время запроса в ОКО из тела запроса', () => {
    it('принимает правдоподобное время', () => {
        expect(parseReadAt(sec('2026-09-13T11:59:00Z'), NOW)).toBe(sec('2026-09-13T11:59:00Z'));
    });

    it('часы Mac mini спешат на секунды — берём «сейчас»', () => {
        expect(parseReadAt(sec('2026-09-13T12:00:20Z'), NOW)).toBe(NOW / 1000);
    });

    it('спешат сильнее — отказ, а не срезание', () => {
        expect(parseReadAt(sec('2026-09-13T12:02:00Z'), NOW)).toBeNull();
    });

    it('мусор отбрасывает', () => {
        expect(parseReadAt('1789300000', NOW)).toBeNull();
        expect(parseReadAt(Number.NaN, NOW)).toBeNull();
        expect(parseReadAt(1_000, NOW)).toBeNull();
        expect(parseReadAt(null, NOW)).toBeNull();
    });
});
