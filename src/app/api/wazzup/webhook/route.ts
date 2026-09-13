import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

import { WAZZUP_PROVIDER } from '../_lib/normalize';
import { processEvent } from '../_lib/processEvent';
import { sanitizeHeaders, tokenMatches } from '../_lib/security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Приём вебхуков Wazzup (Instagram: Direct и комментарии; позже WhatsApp, MAX).
 *
 * Адрес подписки: /api/wazzup/webhook?token=<WAZZUP_WEBHOOK_TOKEN>.
 * Токен принимается в query, как Bearer (если Wazzup пришлёт crmKey, равный
 * токену) или в заголовке X-Wazzup-Token.
 *
 * Порядок тот же, что у ОКО: СНАЧАЛА сохранить сырое событие (3 попытки по
 * 5 секунд), не сохранили — 503, «принято» говорить нельзя. Потом разобрать
 * не дольше ~10 секунд; не успели или сбой разбора — 200: событие у нас,
 * его доразберёт /api/wazzup/reprocess.
 *
 * При подписке Wazzup шлёт {"test": true} и ждёт 200 (таймаут 30 секунд),
 * иначе подписка не проходит.
 */

const SAVE_TIMEOUT_MS = 5_000;
const PARSE_BUDGET_MS = 10_000;
/** Позже этого момента от начала запроса разбор не начинает новых пачек. */
const PARSE_HARD_STOP_MS = 18_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
    const startedAt = Date.now();
    const token = process.env.WAZZUP_WEBHOOK_TOKEN?.trim();
    const allowed = tokenMatches(token, {
        query: request.nextUrl.searchParams.get('token'),
        authorization: request.headers.get('authorization'),
        header: request.headers.get('x-wazzup-token'),
    });
    if (!allowed) {
        return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const raw = await request.text();
    let body: unknown;
    try {
        body = JSON.parse(raw);
    } catch {
        return NextResponse.json({ ok: true, skipped: 'не JSON' });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json({ ok: true, skipped: 'не объект' });
    }
    if ((body as { test?: unknown }).test === true) {
        // Проверка адреса при подписке: ничего не сохраняем.
        return NextResponse.json({ ok: true, test: true });
    }

    const headerEntries: [string, string][] = [];
    request.headers.forEach((value, key) => headerEntries.push([key, value]));
    const headers = sanitizeHeaders(headerEntries, [token, process.env.WAZZUP_API_KEY]);

    let service: ReturnType<typeof createSupabaseServiceRoleClient>;
    try {
        service = createSupabaseServiceRoleClient();
    } catch (error) {
        console.error('Вебхук Wazzup: нет доступа к базе', error instanceof Error ? error.message : error);

        return NextResponse.json({ ok: false, error: 'не сохранили' }, { status: 503 });
    }

    // 1. Сохранить как есть, с повторами: база могла просто просыпаться.
    let eventId: number | null = null;
    let saveError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt) await sleep(300 * attempt);
        try {
            const { data, error } = await service
                .from('messenger_events')
                .insert({ provider: WAZZUP_PROVIDER, payload: body, headers })
                .select('id')
                .abortSignal(AbortSignal.timeout(SAVE_TIMEOUT_MS))
                .single();
            if (!error && data) {
                eventId = (data as { id: number }).id;
                saveError = null;
                break;
            }
            saveError = error?.message ?? 'нет ответа базы';
        } catch (error) {
            saveError = error instanceof Error ? error.message : 'сбой записи';
        }
    }
    if (eventId === null) {
        console.error('Вебхук Wazzup: НЕ СОХРАНИЛИ событие', saveError);

        // 503: честный отказ, чтобы Wazzup знал, что событие не принято.
        return NextResponse.json({ ok: false, error: 'не сохранили' }, { status: 503 });
    }

    // 2. Разобрать в пределах бюджета. Сбой разбора — не повод отвечать ошибкой.
    const deadline = Math.min(Date.now() + PARSE_BUDGET_MS, startedAt + PARSE_HARD_STOP_MS);
    const result = await processEvent(service, eventId, body, { deadline });
    if (!result.ok) {
        if (!result.deferred) console.error('Вебхук Wazzup: разбор не удался', eventId, result.error);

        return NextResponse.json({ ok: true, stored: true, deferred: result.deferred, parse_error: !result.deferred });
    }

    return NextResponse.json({
        ok: true,
        messages: result.messages,
        statuses: result.statuses,
        channels: result.channels,
    });
}

export async function GET() {
    return NextResponse.json({ ok: true });
}
