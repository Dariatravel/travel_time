import { describe, expect, it } from 'vitest';

import {
    channelStateLabel,
    chatTitle,
    checkReplyText,
    directWindow,
    effectiveOutboxStatus,
    formatMoment,
    groupCommentsByPost,
    humanDuration,
    outboxLabel,
    postPreview,
    privateReplyUsed,
    privateReplyWindow,
    visibleOutbox,
    type ChatRow,
    type OutboxRow,
} from './instagram';

const NOW = Date.parse('2026-09-13T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const chat = (extra: Partial<ChatRow> = {}): ChatRow => ({
    chat_id: 'c1',
    kind: 'comment',
    chat_type: 'instagram',
    channel_external_id: 'ch-1',
    external_chat_id: 'anna.travel',
    contact_name: null,
    contact_username: 'anna.travel',
    avatar_uri: null,
    client_id: null,
    client_name: null,
    is_provisional: true,
    last_inbound_at: hoursAgo(1),
    last_message_at: hoursAgo(1),
    waiting_since: null,
    last_text: 'Сколько стоит?',
    last_direction: 'in',
    last_type: 'text',
    last_inbound_external_id: 'k1',
    post_id: 'p1',
    post_external_id: '1789',
    post_src: 'https://www.instagram.com/p/abc/',
    post_description: 'Гагра',
    post_author: 'abhazbereg',
    private_reply_used: false,
    ...extra,
});

const outbox = (extra: Partial<OutboxRow> = {}): OutboxRow => ({
    id: 'o1',
    mode: 'direct',
    ref_external_id: null,
    text: 'Здравствуйте',
    status: 'sent',
    external_message_id: 'm1',
    error: null,
    created_by: 'daria@example.com',
    created_at: hoursAgo(0.1),
    sent_at: hoursAgo(0.1),
    ...extra,
});

describe('длина ответа', () => {
    it('Instagram — 1000 знаков', () => {
        expect(checkReplyText('а'.repeat(1000), 'instagram')).toEqual({ ok: true, length: 1000, limit: 1000, error: null });
        const long = checkReplyText('а'.repeat(1001), 'instagram');
        expect(long.ok).toBe(false);
        expect(long.error).toBe('Слишком длинно: 1001 из 1000 знаков');
    });

    it('пустой и из пробелов — нельзя', () => {
        expect(checkReplyText('', 'instagram').error).toBe('Пустой ответ');
        expect(checkReplyText('   \n', 'instagram').ok).toBe(false);
    });

    it('эмодзи считается за два знака — строже, чем надо, но безопасно', () => {
        expect(checkReplyText('🌊', 'instagram').length).toBe(2);
    });

    it('другие каналы — общий лимит', () => {
        expect(checkReplyText('а'.repeat(2000), 'whatsapp').ok).toBe(true);
    });
});

describe('окно ответа в Direct', () => {
    it('клиент не писал — писать первым нельзя', () => {
        expect(directWindow(null, NOW).tone).toBe('none');
    });

    it('внутри 24 часов — сколько осталось', () => {
        const w = directWindow(hoursAgo(3), NOW);
        expect(w.tone).toBe('ok');
        expect(w.text).toBe('На ответ осталось 21 ч из 24 часов.');
    });

    it('меньше двух часов — предупреждение', () => {
        expect(directWindow(hoursAgo(23), NOW).tone).toBe('warn');
    });

    it('после 24 часов до 7 дней — предупреждение, не запрет', () => {
        const w = directWindow(hoursAgo(30), NOW);
        expect(w.tone).toBe('warn');
        expect(w.text).toContain('24 часа прошли');
        expect(w.text).toContain('осталось 5 дней 18 ч');
    });

    it('больше 7 дней — срок прошёл', () => {
        expect(directWindow(hoursAgo(24 * 7 + 1), NOW).tone).toBe('closed');
    });

    it('часы компьютера позади сервера — не уходит в минус', () => {
        expect(directWindow(hoursAgo(-2), NOW).text).toBe('На ответ осталось 1 день из 24 часов.');
    });
});

describe('приватный ответ на комментарий', () => {
    it('7 дней и один раз', () => {
        expect(privateReplyWindow(hoursAgo(24), false, NOW)).toMatchObject({ tone: 'ok' });
        expect(privateReplyWindow(hoursAgo(24), false, NOW).text).toBe('Написать в Direct можно ещё 6 дней из 7 дней, один раз.');
        expect(privateReplyWindow(hoursAgo(24 * 6.5), false, NOW).tone).toBe('warn');
        expect(privateReplyWindow(hoursAgo(24 * 8), false, NOW).tone).toBe('closed');
        expect(privateReplyWindow(hoursAgo(1), true, NOW).text).toContain('уже писали');
        expect(privateReplyWindow(null, false, NOW).tone).toBe('none');
    });

    it('был ли уже приватный ответ — неудачные не считаются', () => {
        const rows = [
            outbox({ mode: 'comment_private', ref_external_id: 'k1', status: 'failed' }),
            outbox({ id: 'o2', mode: 'comment_public', ref_external_id: 'k2' }),
        ];
        expect(privateReplyUsed(rows, 'k1')).toBe(false);
        expect(privateReplyUsed(rows, 'k2')).toBe(false);
        expect(privateReplyUsed([...rows, outbox({ id: 'o3', mode: 'comment_private', ref_external_id: 'k1', status: 'unknown' })], 'k1')).toBe(true);
        expect(privateReplyUsed(rows, null)).toBe(false);
    });
});

describe('человеческое время', () => {
    it('минуты, часы, дни', () => {
        expect(humanDuration(0)).toBe('1 мин');
        expect(humanDuration(18 * 60_000)).toBe('18 мин');
        expect(humanDuration(5 * 3_600_000 + 20 * 60_000)).toBe('5 ч 20 мин');
        expect(humanDuration(2 * 3_600_000)).toBe('2 ч');
        expect(humanDuration(24 * 3_600_000)).toBe('1 день');
        expect(humanDuration(51 * 3_600_000)).toBe('2 дня 3 ч');
        expect(humanDuration(5 * 24 * 3_600_000)).toBe('5 дней');
    });
});

describe('комментарии по постам', () => {
    it('группирует по посту; где ждут ответа — сверху; Direct не попадает', () => {
        const rows = [
            chat({ chat_id: 'a', post_id: 'p1', last_message_at: hoursAgo(1) }),
            chat({ chat_id: 'b', post_id: 'p2', post_description: 'Пицунда', last_message_at: hoursAgo(5), waiting_since: hoursAgo(5) }),
            chat({ chat_id: 'c', post_id: 'p1', last_message_at: hoursAgo(0.5), waiting_since: null }),
            chat({ chat_id: 'd', kind: 'direct', post_id: null }),
        ];
        const groups = groupCommentsByPost(rows);
        expect(groups.map((g) => g.key)).toEqual(['p2', 'p1']);
        expect(groups[0]).toMatchObject({ description: 'Пицунда', waiting: 1, lastAt: hoursAgo(5) });
        expect(groups[1].chats.map((c) => c.chat_id)).toEqual(['c', 'a']);
        expect(groups[1].lastAt).toBe(hoursAgo(0.5));
    });

    it('без ожидающих — по свежести', () => {
        const groups = groupCommentsByPost([
            chat({ chat_id: 'a', post_id: 'p1', last_message_at: hoursAgo(10) }),
            chat({ chat_id: 'b', post_id: 'p2', last_message_at: hoursAgo(2) }),
        ]);
        expect(groups.map((g) => g.key)).toEqual(['p2', 'p1']);
    });

    it('пустой список', () => {
        expect(groupCommentsByPost([])).toEqual([]);
    });

    it('превью подписи поста', () => {
        expect(postPreview(null)).toBe('Пост без подписи');
        expect(postPreview('  Гагра\n\nвид   на море ')).toBe('Гагра вид на море');
        expect(postPreview('а'.repeat(200), 10)).toBe(`${'а'.repeat(9)}…`);
    });
});

describe('очередь и подписи', () => {
    it('строка очереди скрывается, когда пришло эхо', () => {
        const rows = [outbox({ id: 'o1', external_message_id: 'm1' }), outbox({ id: 'o2', external_message_id: null, status: 'unknown' })];
        expect(visibleOutbox(rows, new Set(['m1'])).map((r) => r.id)).toEqual(['o2']);
    });

    it('статусы отправки', () => {
        expect(outboxLabel({ status: 'pending', mode: 'direct' })).toBe('отправляется…');
        expect(outboxLabel({ status: 'failed', mode: 'direct' })).toBe('не ушло');
        expect(outboxLabel({ status: 'unknown', mode: 'direct' })).toBe('проверьте в Instagram: могло уйти');
        expect(outboxLabel({ status: 'sent', mode: 'comment_private' })).toBe('отправлено в Direct');
        expect(outboxLabel({ status: 'sent', mode: 'comment_public' })).toBe('отправлено под постом');
    });

    it('«отправляется» дольше двух минут показывается как «могло уйти»', () => {
        expect(effectiveOutboxStatus({ status: 'pending', created_at: new Date(NOW - 60_000).toISOString() }, NOW)).toBe('pending');
        expect(effectiveOutboxStatus({ status: 'pending', created_at: new Date(NOW - 180_000).toISOString() }, NOW)).toBe('unknown');
        expect(effectiveOutboxStatus({ status: 'sent', created_at: new Date(NOW - 180_000).toISOString() }, NOW)).toBe('sent');
    });

    it('имя чата и состояние канала', () => {
        expect(chatTitle({ contact_name: 'Анна', contact_username: 'anna', external_chat_id: 'anna' })).toBe('Анна');
        expect(chatTitle({ contact_name: null, contact_username: null, external_chat_id: 'anna' })).toBe('@anna');
        expect(channelStateLabel('active')).toBe('работает');
        expect(channelStateLabel('newState')).toBe('newState');
        expect(channelStateLabel(null)).toBe('неизвестно');
    });

    it('время по Москве', () => {
        expect(formatMoment('2026-09-12T22:30:00Z')).toBe('13.09 01:30');
        expect(formatMoment(null)).toBe('');
    });
});
