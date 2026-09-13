import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeSupabase, hasFilter, type FakeCall, type FakeResult } from '../_test/fakeSupabase';
import { POST } from './route';

let respond: (call: FakeCall) => FakeResult | undefined = () => ({});
let fake = createFakeSupabase((call) => respond(call));

vi.mock('@/app/api/yandex-backend/_lib/supabaseServer', () => ({
    createSupabaseServiceRoleClient: () => fake.client,
}));
vi.mock('@/app/api/admin/_lib/requireAdmin', () => ({
    requireAdmin: async () => ({ user: { id: 'u-1', email: 'daria@example.com' } }),
}));

const DRAFT = '11111111-2222-4333-8444-555555555555';
const CHAT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const fetchMock = vi.fn();

const request = (body: Record<string, unknown>) =>
    new NextRequest('https://app.example.com/api/wazzup/send', { method: 'POST', body: JSON.stringify(body) });

const directChat = { id: CHAT, kind: 'direct', chat_type: 'instagram', chat_id: 'kate', channel_external_id: 'ch-1' };
const commentChat = { ...directChat, kind: 'comment' };

const isDraftLookup = (call: FakeCall) =>
    call.target === 'messenger_outbox' && call.op === 'select' && hasFilter(call, 'eq', 'id', DRAFT);

beforeEach(() => {
    vi.stubEnv('WAZZUP_API_KEY', 'api-key');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    respond = () => ({});
    fake = createFakeSupabase((call) => respond(call));
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('отправка через Wazzup', () => {
    it('нет ключа — понятный отказ «не подключён»', async () => {
        vi.stubEnv('WAZZUP_API_KEY', '');
        const response = await POST(request({ draftId: DRAFT, chatId: CHAT, mode: 'direct', text: 'x' }));
        expect(response.status).toBe(503);
        expect((await response.json()).error).toContain('не подключён');
    });

    it('без ключа черновика — отказ, в Wazzup не идём', async () => {
        const response = await POST(request({ chatId: CHAT, mode: 'direct', text: 'x' }));
        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('первое нажатие: строка с ключом черновика, отправка, «отправлено»', async () => {
        respond = (call) => {
            if (isDraftLookup(call)) return { data: null };
            if (call.target === 'messenger_chats') return { data: directChat };
            if (call.op === 'upsert') return { data: [{ id: DRAFT }] };

            return {};
        };
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ messageId: 'wz-1', chatId: 'kate' }), { status: 201 }));

        const response = await POST(request({ draftId: DRAFT, chatId: CHAT, mode: 'direct', text: '  Здравствуйте\r\n ' }));
        expect(await response.json()).toMatchObject({ id: DRAFT, status: 'sent' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        expect(sent).toMatchObject({ crmMessageId: DRAFT, text: 'Здравствуйте', chatId: 'kate' });
        const upsert = fake.calls.find((c) => c.op === 'upsert');
        expect(upsert?.payload).toMatchObject({ id: DRAFT, text: 'Здравствуйте', status: 'pending' });
        expect(upsert?.chain[0].args[0]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    });

    it('повтор с тем же ключом не отправляет второй раз, а возвращает статус', async () => {
        respond = (call) =>
            isDraftLookup(call) ? { data: { id: DRAFT, chat_id: CHAT, status: 'unknown', error: 'Связь оборвалась' } } : {};

        const response = await POST(request({ draftId: DRAFT, chatId: CHAT, mode: 'direct', text: 'Здравствуйте' }));
        expect(await response.json()).toEqual({ id: DRAFT, status: 'unknown', error: 'Связь оборвалась', repeated: true });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(fake.calls.some((c) => c.op === 'upsert')).toBe(false);
    });

    it('гонка: строку с тем же ключом вставил параллельный запрос — не отправляем', async () => {
        let lookups = 0;
        respond = (call) => {
            if (isDraftLookup(call)) {
                lookups += 1;

                return lookups === 1 ? { data: null } : { data: { id: DRAFT, chat_id: CHAT, status: 'pending', error: null } };
            }
            if (call.target === 'messenger_chats') return { data: directChat };
            if (call.op === 'upsert') return { data: [] };

            return {};
        };
        const response = await POST(request({ draftId: DRAFT, chatId: CHAT, mode: 'direct', text: 'Здравствуйте' }));
        expect(await response.json()).toMatchObject({ status: 'pending', repeated: true });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('второй приватный ответ на тот же комментарий — отказ до Wazzup', async () => {
        respond = (call) => {
            if (isDraftLookup(call)) return { data: null };
            if (call.target === 'messenger_chats') return { data: commentChat };
            if (call.target === 'messenger_messages') return { data: [{ external_id: 'k-1' }] };
            if (call.target === 'messenger_outbox' && hasFilter(call, 'eq', 'mode', 'comment_private')) {
                return { data: [{ id: 'old' }] };
            }

            return {};
        };
        const response = await POST(
            request({ draftId: DRAFT, chatId: CHAT, mode: 'comment_private', text: 'Написали в Direct', refExternalId: 'k-1' }),
        );
        expect(response.status).toBe(409);
        expect((await response.json()).error).toContain('один приватный ответ');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(fake.calls.some((c) => c.op === 'upsert')).toBe(false);
    });

    it('гонка двух приватных ответов: уникальный индекс базы — тоже отказ', async () => {
        respond = (call) => {
            if (isDraftLookup(call)) return { data: null };
            if (call.target === 'messenger_chats') return { data: commentChat };
            if (call.target === 'messenger_messages') return { data: [{ external_id: 'k-1' }] };
            if (call.target === 'messenger_outbox' && hasFilter(call, 'eq', 'mode', 'comment_private')) return { data: [] };
            if (call.op === 'upsert') return { error: { message: 'duplicate key', code: '23505' } };

            return {};
        };
        const response = await POST(
            request({ draftId: DRAFT, chatId: CHAT, mode: 'comment_private', text: 'Написали в Direct', refExternalId: 'k-1' }),
        );
        expect(response.status).toBe(409);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('обрыв связи — «могло уйти», без автоповтора', async () => {
        respond = (call) => {
            if (isDraftLookup(call)) return { data: null };
            if (call.target === 'messenger_chats') return { data: directChat };
            if (call.op === 'upsert') return { data: [{ id: DRAFT }] };

            return {};
        };
        fetchMock.mockRejectedValue(new TypeError('fetch failed'));
        const response = await POST(request({ draftId: DRAFT, chatId: CHAT, mode: 'direct', text: 'Здравствуйте' }));
        expect(await response.json()).toMatchObject({ status: 'unknown' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
