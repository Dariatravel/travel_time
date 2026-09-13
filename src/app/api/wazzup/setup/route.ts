import { requireAdmin } from '@/app/api/admin/_lib/requireAdmin';
import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { isWazzupTransportAccepted } from '@/shared/config/wazzupTransports';
import { NextRequest, NextResponse } from 'next/server';

import { normalizeChannelList, WAZZUP_PROVIDER } from '../_lib/normalize';
import { describeWazzupError, WAZZUP_NOT_CONFIGURED } from '../_lib/send';
import {
    buildWebhookUrl,
    maskForeignUri,
    maskToken,
    parseCurrentWebhook,
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
 *      Записываются ВСЕ каналы аккаунта (экран их показывает), но принимаются
 *      только разрешённые транспорты (src/shared/config/wazzupTransports.ts).
 * POST {subscribe:true}  — «Подключить приём»: то же плюс подписка вебхука.
 *
 * У Wazzup ОДИН адрес вебхука на аккаунт, поэтому подписка осторожная:
 *  - разрешена только при APP_ENV=production (тестовый контур не заберёт
 *    вебхук у рабочего сайта);
 *  - адрес — только из WAZZUP_WEBHOOK_BASE_URL, не из заголовков запроса;
 *  - сначала GET /v3/webhooks: неожиданный формат ответа — ничего не меняем;
 *    чужой адрес — отказ, показываем его маскированным и ждём {"confirm": "заменить"}.
 * Условия проверяются ДО обращений к Wazzup. Таймауты по 8 секунд.
 * Токены в тексты ответов не попадают (hideSecrets).
 */

const STEP_TIMEOUT_MS = 8_000;
const CONFIRM_REPLACE = 'заменить';
const UNEXPECTED_FORMAT = 'Wazzup ответил в неожиданном формате, адрес не меняем';

/** Токен приёма и ключ API не должны попасть на экран даже из текста ошибки Wazzup. */
const hideSecrets = (text: string): string => {
    let clean = maskToken(text);
    for (const secret of [process.env.WAZZUP_WEBHOOK_TOKEN?.trim(), wazzupApiKey()]) {
        if (secret && secret.length >= 4) clean = clean.split(secret).join('***');
    }

    return clean;
};

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
    NextResponse.json({ error: hideSecrets(error), ...extra }, { status });

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
        if (blocker) return fail(blocker, 403);
        webhookUrl = buildWebhookUrl(
            webhookBaseUrl(process.env.WAZZUP_WEBHOOK_BASE_URL) ?? '',
            process.env.WAZZUP_WEBHOOK_TOKEN?.trim() ?? '',
        );
        if (webhookUrl.length > WEBHOOK_URI_MAX) {
            return fail(`Адрес длиннее ${WEBHOOK_URI_MAX} символов — Wazzup его не примет. Сократите токен.`, 400);
        }
    }

    // 1. Каналы — их список нужен и для приёма: сообщения чужих каналов не пишутся.
    const listed = await callWazzup(apiKey, 'GET', '/channels', undefined, STEP_TIMEOUT_MS);
    if (listed.kind === 'network') return fail(`Wazzup не ответил: ${listed.message}`, 502);
    if (!listed.ok) return fail(describeWazzupError(listed.status, listed.body), 502);

    const channels = normalizeChannelList(listed.body).map((c) => ({
        ...c,
        accepted: isWazzupTransportAccepted(c.transport),
    }));
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
        if (error) return fail(`Каналы не записались: ${error.message}`, 502);
    }

    if (!webhookUrl) return NextResponse.json({ channels, subscription: null });

    // 2. Какой адрес сейчас у аккаунта. Не узнали или не поняли ответ — не трогаем.
    const current = await callWazzup(apiKey, 'GET', '/webhooks', undefined, STEP_TIMEOUT_MS);
    if (current.kind === 'network' || !current.ok) {
        const reason =
            current.kind === 'network' ? current.message : describeWazzupError(current.status, current.body);

        return fail(`Не удалось узнать текущий адрес вебхука (${reason}) — подписку не меняли`, 502, { channels });
    }
    const parsed = parseCurrentWebhook(current.body);
    if (!parsed.ok) return fail(UNEXPECTED_FORMAT, 502, { channels });

    if (parsed.uri && !sameWebhookTarget(parsed.uri, webhookUrl) && confirm !== CONFIRM_REPLACE) {
        const masked = maskForeignUri(parsed.uri);

        return fail(
            `В Wazzup уже указан другой адрес приёма: ${masked}. Если его заменить, та система перестанет получать сообщения.`,
            409,
            { needsConfirm: true, current: hideSecrets(masked), channels },
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
                  message: hideSecrets(
                      `Wazzup не ответил (${patched.message}). Подписка могла пройти — нажмите ещё раз через минуту.`,
                  ),
                  url: shown,
              }
            : patched.ok
              ? { ok: true, message: 'Приём подключён: Wazzup проверил адрес.', url: shown }
              : { ok: false, message: hideSecrets(describeWazzupError(patched.status, patched.body)), url: shown };

    return NextResponse.json({ channels, subscription });
}
