import { describe, expect, it } from 'vitest';

import { normalizeChannelList, normalizeWebhook, toIso } from './normalize';

const direct = (extra: Record<string, unknown> = {}) => ({
    messageId: '11111111-1111-1111-1111-111111111111',
    dateTime: '2026-09-13T10:00:00.000Z',
    channelId: 'ch-1',
    chatType: 'instagram',
    chatId: 'anna.travel',
    type: 'text',
    isEcho: false,
    contact: { name: 'Анна', username: 'anna.travel', avatarUri: 'https://cdn/a.jpg' },
    text: 'Здравствуйте! Есть номера на октябрь?',
    status: 'inbound',
    ...extra,
});

describe('вебхук: служебные и кривые тела', () => {
    it('проверочный запрос {test: true} — только признак, без строк', () => {
        const r = normalizeWebhook({ test: true });
        expect(r.test).toBe(true);
        expect(r.messages).toEqual([]);
        expect(r.skipped).toEqual([]);
    });

    it('нет messages, statuses и channelsUpdates — пропуск с причиной', () => {
        const r = normalizeWebhook({ something: 1 });
        expect(r.test).toBe(false);
        expect(r.messages).toEqual([]);
        expect(r.skipped).toEqual(['нет messages, statuses и channelsUpdates']);
    });

    it('тело не объект — не падает', () => {
        expect(normalizeWebhook(null).skipped).toEqual(['тело не объект']);
        expect(normalizeWebhook([1, 2]).skipped).toEqual(['тело не объект']);
        expect(normalizeWebhook('строка').skipped).toEqual(['тело не объект']);
    });

    it('messages не массив — пропуск, остальное разбирается', () => {
        const r = normalizeWebhook({ messages: { a: 1 }, statuses: [{ messageId: 'm1', status: 'read' }] });
        expect(r.skipped).toEqual(['messages не массив']);
        expect(r.statuses).toHaveLength(1);
    });

    it('битое сообщение не мешает хорошему', () => {
        const r = normalizeWebhook({ messages: [42, { chatType: 'instagram' }, direct()] });
        expect(r.messages).toHaveLength(1);
        expect(r.skipped).toEqual(['сообщение не объект', 'сообщение без messageId']);
    });

    it('неизвестный, но аккуратный chatType сохраняется без карточки клиента', () => {
        const r = normalizeWebhook({ messages: [direct({ chatType: 'Threads' })] });
        expect(r.messages[0].chat_type).toBe('threads');
        expect(r.messages[0].identity_kind).toBeNull();
    });

    it('мусорный или пустой chatType — пропуск', () => {
        const r = normalizeWebhook({
            messages: [direct({ chatType: 'insta gram!' }), direct({ messageId: 'x2', chatType: undefined })],
        });
        expect(r.messages).toEqual([]);
        expect(r.skipped[0]).toContain('неизвестный тип чата');
        expect(r.skipped[1]).toContain('неизвестный тип чата');
    });

    it('нет channelId или chatId — пропуск', () => {
        const r = normalizeWebhook({ messages: [direct({ channelId: '' }), direct({ messageId: 'x3', chatId: null })] });
        expect(r.messages).toEqual([]);
        expect(r.skipped).toEqual(['11111111-1111-1111-1111-111111111111: нет channelId', 'x3: нет chatId']);
    });
});

describe('вебхук: сообщения', () => {
    it('входящее в Direct', () => {
        const [m] = normalizeWebhook({ messages: [direct()] }).messages;
        expect(m).toMatchObject({
            external_id: '11111111-1111-1111-1111-111111111111',
            channel_external_id: 'ch-1',
            chat_type: 'instagram',
            chat_id: 'anna.travel',
            kind: 'direct',
            post: null,
            identity_kind: 'instagram',
            direction: 'in',
            is_echo: false,
            sent_from_app: false,
            type: 'text',
            status: 'inbound',
            sent_at: '2026-09-13T10:00:00.000Z',
            contact: { name: 'Анна', username: 'anna.travel', avatar_uri: 'https://cdn/a.jpg' },
        });
        expect(m.text).toBe('Здравствуйте! Есть номера на октябрь?');
    });

    it('isEcho — исходящее от нас, sentFromApp отмечается', () => {
        const [m] = normalizeWebhook({
            messages: [direct({ isEcho: true, sentFromApp: true, authorName: 'Настя', status: 'sent' })],
        }).messages;
        expect(m.direction).toBe('out');
        expect(m.is_echo).toBe(true);
        expect(m.sent_from_app).toBe(true);
        expect(m.author_name).toBe('Настя');
    });

    it('комментарий — по наличию instPost; время поста из миллисекунд', () => {
        const [m] = normalizeWebhook({
            messages: [
                direct({
                    text: 'Сколько стоит?',
                    instPost: {
                        id: 17890001,
                        src: 'https://www.instagram.com/p/abc/',
                        description: 'Гагра, вид на море',
                        authorName: 'abhazbereg',
                        timestamp: Date.parse('2026-09-01T08:00:00Z'),
                    },
                }),
            ],
        }).messages;
        expect(m.kind).toBe('comment');
        expect(m.post).toEqual({
            external_id: '17890001',
            src: 'https://www.instagram.com/p/abc/',
            description: 'Гагра, вид на море',
            author: 'abhazbereg',
            posted_at: '2026-09-01T08:00:00.000Z',
        });
    });

    it('у поста нет id — ключ по sha1, потом по ссылке', () => {
        const bySha = normalizeWebhook({ messages: [direct({ instPost: { sha1: 'abc', src: 'https://x' } })] });
        expect(bySha.messages[0].post?.external_id).toBe('abc');
        const bySrc = normalizeWebhook({ messages: [direct({ instPost: { src: 'https://x' } })] });
        expect(bySrc.messages[0].post?.external_id).toBe('https://x');
        const none = normalizeWebhook({ messages: [direct({ instPost: {} })] });
        expect(none.messages[0].post?.external_id).toBe('unknown');
    });

    it('групповой чат — без карточки клиента', () => {
        const [m] = normalizeWebhook({ messages: [direct({ chatType: 'whatsgroup' })] }).messages;
        expect(m.identity_kind).toBeNull();
    });

    it('правка, удаление, цитата, ошибка, вложение-ссылка', () => {
        const [m] = normalizeWebhook({
            messages: [
                direct({
                    text: '   ',
                    contentUri: 'https://store.wazzup24.com/story.jpg',
                    type: 'IMAGE',
                    isEdited: true,
                    isDeleted: true,
                    quotedMessage: { messageId: 'q-1' },
                    error: { error: 'CHANNEL_UNAVAILABLE', description: 'нет связи' },
                }),
            ],
        }).messages;
        expect(m.text).toBeNull();
        expect(m.content_uri).toBe('https://store.wazzup24.com/story.jpg');
        expect(m.type).toBe('image');
        expect(m.is_edited).toBe(true);
        expect(m.is_deleted).toBe(true);
        expect(m.quoted_external_id).toBe('q-1');
        expect(m.error).toBe('CHANNEL_UNAVAILABLE: нет связи');
    });

    it('кривое время — null (база поставит время приёма)', () => {
        const [m] = normalizeWebhook({ messages: [direct({ dateTime: 'вчера' })] }).messages;
        expect(m.sent_at).toBeNull();
    });
});

describe('вебхук: статусы и каналы', () => {
    it('статусы', () => {
        const r = normalizeWebhook({
            statuses: [
                { messageId: 'm1', status: 'READ', timestamp: '2026-09-13T10:05:00Z' },
                { messageId: 'm2', status: 'error', error: { error: 'MESSAGES_IS_SPAM' } },
                { status: 'read' },
            ],
        });
        expect(r.statuses).toEqual([
            { external_id: 'm1', status: 'read', error: null, at: '2026-09-13T10:05:00.000Z' },
            { external_id: 'm2', status: 'error', error: 'MESSAGES_IS_SPAM', at: null },
        ]);
        expect(r.skipped).toEqual(['статус без messageId или status']);
    });

    it('обновления каналов', () => {
        const r = normalizeWebhook({ channelsUpdates: [{ channelId: 'ch-1', state: 'active', timestamp: 1 }, {}] });
        expect(r.channels).toEqual([{ external_id: 'ch-1', transport: null, plain_id: null, state: 'active' }]);
        expect(r.skipped).toEqual(['канал без channelId']);
    });

    it('список каналов из GET /v3/channels', () => {
        expect(
            normalizeChannelList([
                { channelId: 'ch-1', transport: 'instagram', plainId: 'abhazbereg', state: 'active' },
                { transport: 'whatsapp' },
            ]),
        ).toEqual([{ external_id: 'ch-1', transport: 'instagram', plain_id: 'abhazbereg', state: 'active' }]);
        expect(normalizeChannelList({ error: 'x' })).toEqual([]);
    });
});

describe('время', () => {
    it('ISO, миллисекунды, секунды, строка из цифр, мусор', () => {
        expect(toIso('2026-09-13T10:00:00Z')).toBe('2026-09-13T10:00:00.000Z');
        expect(toIso(Date.parse('2026-09-13T10:00:00Z'))).toBe('2026-09-13T10:00:00.000Z');
        expect(toIso(Date.parse('2026-09-13T10:00:00Z') / 1000)).toBe('2026-09-13T10:00:00.000Z');
        expect(toIso(String(Date.parse('2026-09-13T10:00:00Z')))).toBe('2026-09-13T10:00:00.000Z');
        expect(toIso('нет')).toBeNull();
        expect(toIso(0)).toBeNull();
        expect(toIso(null)).toBeNull();
    });
});
