import { describe, expect, it } from 'vitest';

import { chatChecks, parseReadAt } from './chatChecks';
import type { OkoMessage } from './processEvent';

const NOW = Date.parse('2026-09-13T12:00:00Z');
const sec = (iso: string) => Date.parse(iso) / 1000;

const msg = (id: number, chat: number, at: string | null): OkoMessage => ({
    id,
    contact_messenger_id: chat,
    created_at: at ? sec(at) : null,
    direction: 'incoming',
});

describe('отметка «сверка прочитала чат»', () => {
    it('без времени запроса — время самого свежего сообщения чата', () => {
        const checks = chatChecks(
            [
                msg(1, 100, '2026-09-13T09:00:00Z'),
                msg(2, 100, '2026-09-13T10:00:00Z'),
                msg(3, 200, '2026-09-12T08:00:00Z'),
            ],
            new Set(),
            null,
            NOW,
        );
        expect(checks).toEqual([
            { messenger_id: 100, checked_at: '2026-09-13T10:00:00.000Z' },
            { messenger_id: 200, checked_at: '2026-09-12T08:00:00.000Z' },
        ]);
    });

    it('переписку читали по контакту — время запроса', () => {
        const checks = chatChecks([msg(1, 100, '2026-09-13T09:00:00Z')], new Set(), sec('2026-09-13T11:30:00Z'), NOW);
        expect(checks).toEqual([{ messenger_id: 100, checked_at: '2026-09-13T11:30:00.000Z' }]);
    });

    it('сообщение не записалось — чат не отмечается: это мог быть ответ менеджера', () => {
        const checks = chatChecks(
            [msg(1, 100, '2026-09-13T09:00:00Z'), msg(2, 100, '2026-09-13T10:00:00Z'), msg(3, 200, '2026-09-13T10:00:00Z')],
            new Set([2]),
            null,
            NOW,
        );
        expect(checks.map((c) => c.messenger_id)).toEqual([200]);
    });

    it('сообщение без номера — чат не отмечается', () => {
        const broken = { contact_messenger_id: 100, created_at: sec('2026-09-13T10:00:00Z') } as OkoMessage;
        expect(chatChecks([msg(1, 100, '2026-09-13T09:00:00Z'), broken], new Set(), null, NOW)).toEqual([]);
    });

    it('ни времени сообщений, ни времени запроса — отмечать нечем', () => {
        expect(chatChecks([msg(1, 100, null)], new Set(), null, NOW)).toEqual([]);
    });

    it('время из будущего срезается до «сейчас»', () => {
        const checks = chatChecks([msg(1, 100, '2026-09-14T00:00:00Z')], new Set(), null, NOW);
        expect(checks).toEqual([{ messenger_id: 100, checked_at: '2026-09-13T12:00:00.000Z' }]);
    });

    it('сообщения без переписки и мусорные номера пропускаются', () => {
        const noChat = { id: 5, created_at: sec('2026-09-13T10:00:00Z') } as OkoMessage;
        const fraction = { id: 6, contact_messenger_id: 1.5, created_at: sec('2026-09-13T10:00:00Z') } as OkoMessage;
        expect(chatChecks([noChat, fraction], new Set(), null, NOW)).toEqual([]);
    });
});

describe('время запроса в ОКО из тела запроса', () => {
    it('принимает правдоподобное время', () => {
        expect(parseReadAt(sec('2026-09-13T11:59:00Z'), NOW)).toBe(sec('2026-09-13T11:59:00Z'));
    });

    it('часы Mac mini чуть спешат — берём «сейчас»', () => {
        expect(parseReadAt(sec('2026-09-13T12:02:00Z'), NOW)).toBe(NOW / 1000);
    });

    it('мусор отбрасывает', () => {
        expect(parseReadAt('1789300000', NOW)).toBeNull();
        expect(parseReadAt(Number.NaN, NOW)).toBeNull();
        expect(parseReadAt(1_000, NOW)).toBeNull();
        expect(parseReadAt(sec('2026-09-13T13:00:00Z'), NOW)).toBeNull();
        expect(parseReadAt(null, NOW)).toBeNull();
    });
});
