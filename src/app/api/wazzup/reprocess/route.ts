import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

import { DEFAULT_BUDGET_MS, processEvent } from '../_lib/processEvent';
import { constantEquals } from '../_lib/security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Повторный разбор событий Wazzup — как /api/oko/reprocess.
 *
 * Событие сохраняется сырым до разбора. Не разобралось (база была занята,
 * не хватило времени, канал ещё не заведён) — этот адрес разбирает его
 * повторно с растущими паузами (1, 5, 25 минут…), после десяти попыток
 * событие ждёт человека. Первая попытка — не раньше 2 минут после приёма.
 *
 * Зовёт сторож rental-ai на Mac mini: POST раз в 5 минут с X-Oko-Token
 * (настроено главной сессией, в этом репозитории ничего для этого не нужно).
 * Заодно messenger_events_to_retry убирает отложенные статусы доставки
 * (messenger_pending_statuses) старше 7 дней — их сообщение уже не придёт.
 * Защита — только заголовок
 * X-Oko-Token (OKO_OUTBOX_TOKEN, общий секрет очереди, он уже есть на
 * Mac mini). Токен вебхука Wazzup здесь НЕ принимается: он живёт в адресе
 * у Wazzup и не должен открывать служебные маршруты.
 * В Wazzup запросов не делает: разбирает то, что уже у нас.
 */

const MAX_BATCH = 5;
/** На весь заход — 20 секунд из 30 у контейнера. */
const ROUTE_BUDGET_MS = 20_000;

const authorized = (request: NextRequest): boolean => {
    const expected = process.env.OKO_OUTBOX_TOKEN;
    const given = request.headers.get('x-oko-token');

    return !!expected && !!given && constantEquals(expected, given);
};

export async function POST(request: NextRequest) {
    if (!authorized(request)) {
        return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const startedAt = Date.now();
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc('messenger_events_to_retry', { p_limit: MAX_BATCH });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 502 });
    }

    const events = (data ?? []) as { event_id: number; event_payload: unknown; event_attempts: number }[];
    let done = 0;
    let failed = 0;
    let deferred = 0;
    const errors: string[] = [];
    for (const event of events) {
        if (Date.now() - startedAt > ROUTE_BUDGET_MS) {
            // Не успели взяться — вернуть без траты попытки.
            await service.rpc('messenger_event_defer', { p_id: event.event_id });
            deferred += 1;
            continue;
        }
        const deadline = Math.min(Date.now() + DEFAULT_BUDGET_MS, startedAt + ROUTE_BUDGET_MS);
        const result = await processEvent(service, event.event_id, event.event_payload ?? {}, { deadline });
        if (result.ok) done += 1;
        else if (result.deferred) deferred += 1;
        else {
            failed += 1;
            if (errors.length < 5) errors.push(`${event.event_id}: ${result.error}`);
        }
    }

    const { count: pending } = await service
        .from('messenger_events')
        .select('id', { count: 'exact', head: true })
        .is('processed_at', null);
    const { count: givenUp } = await service
        .from('messenger_events')
        .select('id', { count: 'exact', head: true })
        .is('processed_at', null)
        .gte('attempts', 10);

    return NextResponse.json({
        ok: true,
        взято: events.length,
        разобрано: done,
        отложено: deferred,
        не_вышло: failed,
        ждут_разбора: pending ?? 0,
        сдались: givenUp ?? 0,
        ошибки: errors,
    });
}
