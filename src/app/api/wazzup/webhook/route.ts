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
 * Порядок тот же, что у ОКО: СНАЧАЛА сохранить сырое событие (3 попытки),
 * не сохранили — 503, «принято» говорить нельзя. Потом разобрать; сбой
 * разбора — 200: событие у нас, его переразберёт /api/wazzup/reprocess.
 *
 * При подписке Wazzup шлёт {"test": true} и ждёт 200 (таймаут 30 секунд),
 * иначе подписка не проходит.
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
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
        const { data, error } = await service
            .from('messenger_events')
            .insert({ provider: WAZZUP_PROVIDER, payload: body, headers })
            .select('id')
            .single();
        if (!error && data) {
            eventId = (data as { id: number }).id;
            saveError = null;
            break;
        }
        saveError = error?.message ?? 'нет ответа базы';
    }
    if (eventId === null) {
        console.error('Вебхук Wazzup: НЕ СОХРАНИЛИ событие', saveError);

        // 503: честный отказ, чтобы Wazzup знал, что событие не принято.
        return NextResponse.json({ ok: false, error: 'не сохранили' }, { status: 503 });
    }

    // 2. Разобрать. Сбой разбора — не повод отвечать ошибкой: событие у нас.
    const result = await processEvent(service, eventId, body);
    if (!result.ok) {
        console.error('Вебхук Wazzup: разбор не удался', eventId, result.error);

        return NextResponse.json({ ok: true, stored: true, parse_error: true });
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
