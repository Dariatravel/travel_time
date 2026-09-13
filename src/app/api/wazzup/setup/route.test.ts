import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeSupabase, type FakeCall, type FakeResult } from '../_test/fakeSupabase';
import { GET, POST } from './route';

let respond: (call: FakeCall) => FakeResult | undefined = () => ({});
let fake = createFakeSupabase((call) => respond(call));

vi.mock('@/app/api/yandex-backend/_lib/supabaseServer', () => ({
    createSupabaseServiceRoleClient: () => fake.client,
}));
vi.mock('@/app/api/admin/_lib/requireAdmin', () => ({
    requireAdmin: async () => ({ user: { id: 'u-1', email: 'daria@example.com' } }),
}));

const BASE = 'https://d5d4qekr1vt33i1f6g42.tmjd4m4j.apigw.yandexcloud.net';
const TOKEN = 'hook-token-5678';
const fetchMock = vi.fn();

const post = (body: Record<string, unknown>) =>
    new NextRequest('https://evil.example.com/api/wazzup/setup', {
        method: 'POST',
        body: JSON.stringify(body),
        // Подделанные заголовки не должны влиять на адрес подписки.
        headers: { 'x-forwarded-host': 'evil.example.com' },
    });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Wazzup: каналы, текущий адрес вебхука, подписка. */
const wazzup = (currentUri: string | null) =>
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.endsWith('/channels')) {
            return json([{ channelId: 'ch-1', transport: 'instagram', plainId: 'abhazbereg', state: 'active' }]);
        }
        if (url.endsWith('/webhooks') && method === 'GET') {
            return json({ webhooksUri: currentUri, subscriptions: { messagesAndStatuses: true } });
        }
        if (url.endsWith('/webhooks') && method === 'PATCH') return json({ ok: true });

        return json({ error: 'unexpected' }, 500);
    });

const patchCalls = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');

beforeEach(() => {
    vi.stubEnv('WAZZUP_API_KEY', 'api-key');
    vi.stubEnv('WAZZUP_WEBHOOK_TOKEN', TOKEN);
    vi.stubEnv('WAZZUP_WEBHOOK_BASE_URL', BASE);
    vi.stubEnv('APP_ENV', 'production');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    respond = () => ({});
    fake = createFakeSupabase((call) => respond(call));
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('настройка Wazzup', () => {
    it('без ключа — «не подключён», в Wazzup не идём', async () => {
        vi.stubEnv('WAZZUP_API_KEY', '');
        const response = await POST(post({ subscribe: true }));
        expect(response.status).toBe(503);
        expect((await response.json()).error).toContain('не подключён');
        expect(fetchMock).not.toHaveBeenCalled();

        const status = await (await GET(new NextRequest('https://app.example.com/api/wazzup/setup'))).json();
        expect(status).toMatchObject({ configured: false });
    });

    it('без APP_ENV=production подписка запрещена, ни одного запроса в Wazzup', async () => {
        vi.stubEnv('APP_ENV', 'staging');
        const response = await POST(post({ subscribe: true, confirm: 'заменить' }));
        expect(response.status).toBe(403);
        expect((await response.json()).error).toContain('APP_ENV=production');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('без WAZZUP_WEBHOOK_BASE_URL подписка запрещена — адрес из заголовков не берём', async () => {
        vi.stubEnv('WAZZUP_WEBHOOK_BASE_URL', '');
        const response = await POST(post({ subscribe: true }));
        expect(response.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('«Обновить каналы» работает и не на рабочем контуре, подписку не трогает', async () => {
        vi.stubEnv('APP_ENV', 'staging');
        wazzup(null);
        const response = await POST(post({ subscribe: false }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ subscription: null });
        expect(fake.calls.find((c) => c.op === 'upsert')?.target).toBe('messenger_channels');
        expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/webhooks'))).toBe(false);
    });

    it('чужой адрес без confirm — отказ с маскированным адресом, PATCH не отправлен', async () => {
        wazzup('https://crm.example.org/hooks/wazzup/abc?key=SECRET');
        const response = await POST(post({ subscribe: true }));
        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body).toMatchObject({ needsConfirm: true, current: 'crm.example.org/hooks/wazzu…' });
        expect(JSON.stringify(body)).not.toContain('SECRET');
        expect(patchCalls()).toHaveLength(0);
    });

    it('чужой адрес с confirm «заменить» — подписка на наш адрес из переменной', async () => {
        wazzup('https://crm.example.org/hooks/wazzup/abc?key=SECRET');
        const response = await POST(post({ subscribe: true, confirm: 'заменить' }));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.subscription).toMatchObject({ ok: true });
        expect(body.subscription.url).not.toContain(TOKEN);
        expect(patchCalls()).toHaveLength(1);
        const init = patchCalls()[0]?.[1] as RequestInit | undefined;
        const sent = JSON.parse(String(init?.body));
        expect(sent.webhooksUri).toBe(`${BASE}/api/wazzup/webhook?token=${TOKEN}`);
        expect(sent.subscriptions).toMatchObject({ messagesAndStatuses: true, channelsUpdates: true });
    });

    it('там уже наш адрес (хоть со старым токеном) или пусто — подписка без confirm', async () => {
        wazzup(`${BASE}/api/wazzup/webhook?token=old`);
        expect((await POST(post({ subscribe: true }))).status).toBe(200);
        expect(patchCalls()).toHaveLength(1);

        fetchMock.mockReset();
        wazzup('');
        expect((await POST(post({ subscribe: true }))).status).toBe(200);
        expect(patchCalls()).toHaveLength(1);
    });

    it('не узнали текущий адрес — подписку не меняем', async () => {
        fetchMock.mockImplementation(async (url: string) =>
            url.endsWith('/channels') ? json([]) : json({ error: 'boom' }, 500),
        );
        const response = await POST(post({ subscribe: true }));
        expect(response.status).toBe(502);
        expect(patchCalls()).toHaveLength(0);
    });
});
