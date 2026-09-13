import { requireAdmin } from '@/app/api/admin/_lib/requireAdmin';
import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

import { normalizeChannelList, WAZZUP_PROVIDER } from '../_lib/normalize';
import { describeWazzupError } from '../_lib/send';
import { buildWebhookUrl, maskToken, publicBaseUrl, WEBHOOK_URI_MAX } from '../_lib/security';
import { callWazzup, wazzupApiKey } from '../_lib/wazzupApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Настройка Wazzup (только admin, по кнопке «Подключить приём»).
 *
 * 1. GET /v3/channels → каналы в messenger_channels.
 * 2. Если subscribe (по умолчанию да): PATCH /v3/webhooks с адресом
 *    <публичный адрес>/api/wazzup/webhook?token=… Wazzup тут же шлёт на него
 *    {"test": true}; адрес ответил 200 — подписка прошла.
 *
 * Публичный адрес: WAZZUP_WEBHOOK_BASE_URL, иначе заголовки шлюза.
 * У Wazzup один адрес вебхука на аккаунт, поэтому на тестовом контуре
 * подписка выключена (иначе рабочий сайт перестал бы получать сообщения);
 * включить можно переменной WAZZUP_ALLOW_STAGING_SETUP=true.
 * Таймауты по 10 секунд: у контейнера на весь запрос 30.
 */

const STEP_TIMEOUT_MS = 10_000;

type Subscription = { ok: boolean; message: string; url?: string };

export async function POST(request: NextRequest) {
    const auth = await requireAdmin(request);
    if ('error' in auth) return auth.error;

    const apiKey = wazzupApiKey();
    if (!apiKey) {
        return NextResponse.json(
            { error: 'Ключ Wazzup не задан: добавьте секрет WAZZUP_API_KEY и перевыкатите программу' },
            { status: 400 },
        );
    }

    let subscribe = true;
    try {
        const body = (await request.json()) as { subscribe?: unknown } | null;
        if (body && body.subscribe === false) subscribe = false;
    } catch {
        // Пустое тело — полная настройка.
    }

    const listed = await callWazzup(apiKey, 'GET', '/channels', undefined, STEP_TIMEOUT_MS);
    if (listed.kind === 'network') {
        return NextResponse.json({ error: `Wazzup не ответил: ${listed.message}` }, { status: 502 });
    }
    if (!listed.ok) {
        return NextResponse.json({ error: describeWazzupError(listed.status, listed.body) }, { status: 502 });
    }

    const channels = normalizeChannelList(listed.body);
    const service = createSupabaseServiceRoleClient();
    if (channels.length > 0) {
        const now = new Date().toISOString();
        const { error } = await service.from('messenger_channels').upsert(
            channels.map((c) => ({
                provider: WAZZUP_PROVIDER,
                external_id: c.external_id,
                transport: c.transport,
                plain_id: c.plain_id,
                state: c.state,
                updated_at: now,
            })),
            { onConflict: 'provider,external_id' },
        );
        if (error) return NextResponse.json({ error: `Каналы не записались: ${error.message}` }, { status: 502 });
    }

    let subscription: Subscription | null = null;
    if (subscribe) {
        const token = process.env.WAZZUP_WEBHOOK_TOKEN?.trim();
        if (process.env.APP_ENV === 'staging' && process.env.WAZZUP_ALLOW_STAGING_SETUP !== 'true') {
            subscription = {
                ok: false,
                message:
                    'На тестовом контуре подписка выключена: у Wazzup один адрес на аккаунт, и рабочий сайт перестал бы получать сообщения.',
            };
        } else if (!token) {
            subscription = { ok: false, message: 'Токен приёма не задан (WAZZUP_WEBHOOK_TOKEN)' };
        } else {
            const base = publicBaseUrl(
                process.env.WAZZUP_WEBHOOK_BASE_URL,
                (name) => request.headers.get(name),
                request.nextUrl.origin,
            );
            const url = buildWebhookUrl(base, token);
            const shown = maskToken(url);
            if (url.length > WEBHOOK_URI_MAX) {
                subscription = {
                    ok: false,
                    message: `Адрес длиннее ${WEBHOOK_URI_MAX} символов — Wazzup его не примет. Сократите токен.`,
                    url: shown,
                };
            } else {
                const patched = await callWazzup(
                    apiKey,
                    'PATCH',
                    '/webhooks',
                    {
                        webhooksUri: url,
                        subscriptions: {
                            messagesAndStatuses: true,
                            contactsAndDealsCreation: false,
                            channelsUpdates: true,
                            templateStatus: false,
                        },
                    },
                    STEP_TIMEOUT_MS,
                );
                subscription =
                    patched.kind === 'network'
                        ? {
                              ok: false,
                              message: `Wazzup не ответил (${patched.message}). Подписка могла пройти — нажмите ещё раз через минуту.`,
                              url: shown,
                          }
                        : patched.ok
                          ? { ok: true, message: 'Приём подключён: Wazzup проверил адрес.', url: shown }
                          : { ok: false, message: describeWazzupError(patched.status, patched.body), url: shown };
            }
        }
    }

    return NextResponse.json({ channels, subscription });
}
