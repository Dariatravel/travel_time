import { requireAdmin } from '@/app/api/admin/_lib/requireAdmin';
import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

import { normalizeChannelList, WAZZUP_PROVIDER } from '../_lib/normalize';
import { describeWazzupError, WAZZUP_NOT_CONFIGURED } from '../_lib/send';
import {
    buildWebhookUrl,
    maskForeignUri,
    maskToken,
    sameWebhookTarget,
    webhookBaseUrl,
    WEBHOOK_URI_MAX,
} from '../_lib/security';
import { callWazzup, wazzupApiKey } from '../_lib/wazzupApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Настройка Wazzup (только admin).
 *
 * GET  — подключён ли Wazzup на этом контуре (для экрана), без запросов в Wazzup.
 * POST {subscribe:false} — «Обновить каналы»: GET /v3/channels → messenger_channels.
 * POST {subscribe:true}  — «Подключить приём»: то же плюс подписка вебхука.
 *
 * У Wazzup ОДИН адрес вебхука на аккаунт, поэтому подписка осторожная:
 *  - разрешена только при APP_ENV=production (тестовый контур не заберёт
 *    вебхук у рабочего сайта);
 *  - адрес — только из WAZZUP_WEBHOOK_BASE_URL, не из заголовков запроса;
 *  - сначала GET /v3/webhooks: там чужой адрес — отказ, показываем его
 *    маскированным и ждём {"confirm": "заменить"}.
 * Условия проверяются ДО обращений к Wazzup. Таймауты по 8 секунд.
 */

const STEP_TIMEOUT_MS = 8_000;
const CONFIRM_REPLACE = 'заменить';

const subscribeBlocker = (): string | null => {
    if (process.env.APP_ENV !== 'production') {
        return 'Подключать приём можно только на рабочем контуре (APP_ENV=production)';
    }
    if (!process.env.WAZZUP_WEBHOOK_TOKEN?.trim()) return 'Токен приёма не задан (WAZZUP_WEBHOOK_TOKEN)';
    if (!webhookBaseUrl(process.env.WAZZUP_WEBHOOK_BASE_URL)) {
        return 'Адрес программы не задан или неверный (WAZZUP_WEBHOOK_BASE_URL, нужен https)';
    }

    return null;
};

export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (!auth.user) return auth.error ?? NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const configured = !!wazzupApiKey();

    return NextResponse.json({
        configured,
        message: configured ? null : 'Wazzup на этом контуре не подключён',
        subscribeBlocker: configured ? subscribeBlocker() : null,
    });
}

export async function POST(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (!auth.user) return auth.error ?? NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const apiKey = wazzupApiKey();
    if (!apiKey) return NextResponse.json({ error: WAZZUP_NOT_CONFIGURED }, { status: 503 });

    let subscribe = true;
    let confirm = '';
    try {
        const body = (await request.json()) as { subscribe?: unknown; confirm?: unknown } | null;
        if (body && body.subscribe === false) subscribe = false;
        if (body && typeof body.confirm === 'string') confirm = body.confirm.trim().toLowerCase();
    } catch {
        // Пустое тело — полная настройка.
    }

    let webhookUrl: string | null = null;
    if (subscribe) {
        const blocker = subscribeBlocker();
        if (blocker) return NextResponse.json({ error: blocker }, { status: 403 });
        webhookUrl = buildWebhookUrl(
            webhookBaseUrl(process.env.WAZZUP_WEBHOOK_BASE_URL) ?? '',
            process.env.WAZZUP_WEBHOOK_TOKEN?.trim() ?? '',
        );
        if (webhookUrl.length > WEBHOOK_URI_MAX) {
            return NextResponse.json(
                { error: `Адрес длиннее ${WEBHOOK_URI_MAX} символов — Wazzup его не примет. Сократите токен.` },
                { status: 400 },
            );
        }
    }

    // 1. Каналы — их список нужен и для приёма: сообщения чужих каналов не пишутся.
    const listed = await callWazzup(apiKey, 'GET', '/channels', undefined, STEP_TIMEOUT_MS);
    if (listed.kind === 'network') {
        return NextResponse.json({ error: `Wazzup не ответил: ${listed.message}` }, { status: 502 });
    }
    if (!listed.ok) {
        return NextResponse.json({ error: describeWazzupError(listed.status, listed.body) }, { status: 502 });
    }
    const channels = normalizeChannelList(listed.body);
    if (channels.length > 0) {
        const service = createSupabaseServiceRoleClient();
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

    if (!webhookUrl) return NextResponse.json({ channels, subscription: null });

    // 2. Какой адрес сейчас у аккаунта. Не узнали — не трогаем.
    const current = await callWazzup(apiKey, 'GET', '/webhooks', undefined, STEP_TIMEOUT_MS);
    if (current.kind === 'network' || !current.ok) {
        const reason =
            current.kind === 'network' ? current.message : describeWazzupError(current.status, current.body);

        return NextResponse.json(
            { error: `Не удалось узнать текущий адрес вебхука (${reason}) — подписку не меняли`, channels },
            { status: 502 },
        );
    }
    const rawUri = (current.body as { webhooksUri?: unknown } | null)?.webhooksUri;
    const currentUri = typeof rawUri === 'string' ? rawUri.trim() : '';
    if (currentUri && !sameWebhookTarget(currentUri, webhookUrl) && confirm !== CONFIRM_REPLACE) {
        const masked = maskForeignUri(currentUri);

        return NextResponse.json(
            {
                error: `В Wazzup уже указан другой адрес приёма: ${masked}. Если его заменить, та система перестанет получать сообщения.`,
                needsConfirm: true,
                current: masked,
                channels,
            },
            { status: 409 },
        );
    }

    // 3. Подписка. Wazzup тут же проверит адрес запросом {"test": true}.
    const patched = await callWazzup(
        apiKey,
        'PATCH',
        '/webhooks',
        {
            webhooksUri: webhookUrl,
            subscriptions: {
                messagesAndStatuses: true,
                contactsAndDealsCreation: false,
                channelsUpdates: true,
                templateStatus: false,
            },
        },
        STEP_TIMEOUT_MS,
    );
    const shown = maskToken(webhookUrl);
    const subscription =
        patched.kind === 'network'
            ? {
                  ok: false,
                  message: `Wazzup не ответил (${patched.message}). Подписка могла пройти — нажмите ещё раз через минуту.`,
                  url: shown,
              }
            : patched.ok
              ? { ok: true, message: 'Приём подключён: Wazzup проверил адрес.', url: shown }
              : { ok: false, message: describeWazzupError(patched.status, patched.body), url: shown };

    return NextResponse.json({ channels, subscription });
}
