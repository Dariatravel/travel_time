import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeSupabase, type FakeCall, type FakeResult } from '../_test/fakeSupabase';
import { POST } from './route';

let respond: (call: FakeCall) => FakeResult | undefined = () => ({});
let fake = createFakeSupabase((call) => respond(call));

vi.mock('@/app/api/yandex-backend/_lib/supabaseServer', () => ({
    createSupabaseServiceRoleClient: () => fake.client,
}));

const TOKEN = 'webhook-token-1234';

const request = (body: unknown, token: string | null = TOKEN) =>
    new NextRequest(`https://app.example.com/api/wazzup/webhook${token === null ? '' : `?token=${token}`}`, {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    });

const message = {
    messageId: 'm-1',
    dateTime: '2026-09-13T10:00:00Z',
    channelId: 'ch-x',
    chatType: 'instagram',
    chatId: 'Kate',
    type: 'text',
    text: 'Здравствуйте',
    isEcho: false,
};

beforeEach(() => {
    vi.stubEnv('WAZZUP_WEBHOOK_TOKEN', TOKEN);
    respond = () => ({});
    fake = createFakeSupabase((call) => respond(call));
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('вебхук Wazzup', () => {
    it('без токена или с чужим — 401, в базу не ходим', async () => {
        expect((await POST(request({ messages: [message] }, null))).status).toBe(401);
        expect((await POST(request({ messages: [message] }, 'wrong'))).status).toBe(401);
        expect(fake.calls).toHaveLength(0);
    });

    it('токен сервера не задан — 401 даже с пустым токеном', async () => {
        vi.stubEnv('WAZZUP_WEBHOOK_TOKEN', '');
        expect((await POST(request({ test: true }, ''))).status).toBe(401);
    });

    it('проверочный {test: true} — 200 без записи', async () => {
        const response = await POST(request({ test: true }));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true, test: true });
        expect(fake.calls).toHaveLength(0);
    });

    it('Bearer с тем же токеном тоже принимается', async () => {
        const req = new NextRequest('https://app.example.com/api/wazzup/webhook', {
            method: 'POST',
            body: JSON.stringify({ test: true }),
            headers: { authorization: `Bearer ${TOKEN}` },
        });
        expect((await POST(req)).status).toBe(200);
    });

    it('событие не сохранилось за три попытки — 503, разбора нет', async () => {
        respond = (call) => (call.op === 'insert' ? { error: { message: 'база спит' } } : {});
        const response = await POST(request({ messages: [message] }));
        expect(response.status).toBe(503);
        expect(fake.calls.filter((c) => c.op === 'insert')).toHaveLength(3);
        expect(fake.calls.some((c) => c.op === 'rpc')).toBe(false);
    });

    it('сохранённое событие без секретов, ник в нижнем регистре, отметка «разобрано»', async () => {
        respond = (call) => {
            if (call.op === 'insert') return { data: { id: 1 } };
            if (call.target === 'rpc:messenger_ingest_batch') {
                return { data: { messages: 1, statuses: 0, channels: 0, errors: [], unknown_channels: [], skipped_channels: [] } };
            }

            return {};
        };
        const response = await POST(request({ messages: [message] }));
        expect(response.status).toBe(200);
        const insert = fake.calls.find((c) => c.op === 'insert');
        expect(JSON.stringify(insert?.payload)).not.toContain(TOKEN);
        const batch = fake.calls.find((c) => c.target === 'rpc:messenger_ingest_batch');
        expect((batch?.payload as { p_messages: { chat_id: string }[] }).p_messages[0].chat_id).toBe('kate');
        const mark = fake.calls.find((c) => c.op === 'update' && c.target === 'messenger_events');
        expect((mark?.payload as { processed_at?: string }).processed_at).toBeTruthy();
    });

    it('неизвестный канал — 200, событие остаётся неразобранным с ошибкой', async () => {
        respond = (call) => {
            if (call.op === 'insert') return { data: { id: 7 } };
            if (call.target === 'rpc:messenger_ingest_batch') {
                return {
                    data: { messages: 0, statuses: 0, channels: 0, errors: [], unknown_channels: ['ch-x'], skipped_channels: [] },
                };
            }

            return {};
        };
        const response = await POST(request({ messages: [message] }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ ok: true, stored: true, parse_error: true });
        const updates = fake.calls.filter((c) => c.op === 'update' && c.target === 'messenger_events');
        expect(updates).toHaveLength(1);
        const payload = updates[0].payload as { error?: string; processed_at?: string };
        expect(payload.error).toContain('неизвестный канал');
        expect(payload.processed_at).toBeUndefined();
    });
});
