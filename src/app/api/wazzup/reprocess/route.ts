import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

import { processEvent } from '../_lib/processEvent';
import { constantEquals } from '../_lib/security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Повторный разбор событий Wazzup — как /api/oko/reprocess.
 *
 * Событие сохраняется сырым до разбора. Не разобралось (база была занята) —
 * этот адрес разбирает его повторно с растущими паузами (1, 5, 25 минут…),
 * после десяти попыток событие ждёт человека.
 *
 * Звать раз в несколько минут с Mac mini. Защита — только заголовок, не query
 * (адрес попадает в журналы шлюза):
 *   X-Wazzup-Token: <WAZZUP_WEBHOOK_TOKEN>  или
 *   X-Oko-Token:    <OKO_OUTBOX_TOKEN>  — общий секрет очереди, он уже есть на Mac mini.
 * В Wazzup запросов не делает: разбирает то, что уже у нас.
 */

const MAX_BATCH = 5;

const headerMatches = (expected: string | undefined, given: string | null): boolean =>
    !!expected && !!given && constantEquals(expected, given);

const authorized = (request: NextRequest): boolean => {
    const wazzup = headerMatches(process.env.WAZZUP_WEBHOOK_TOKEN?.trim(), request.headers.get('x-wazzup-token'));
    const oko = headerMatches(process.env.OKO_OUTBOX_TOKEN, request.headers.get('x-oko-token'));

    return wazzup || oko;
};

export async function POST(request: NextRequest) {
    if (!authorized(request)) {
        return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc('messenger_events_to_retry', { p_limit: MAX_BATCH });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 502 });
    }

    const events = (data ?? []) as { event_id: number; event_payload: unknown; event_attempts: number }[];
    let done = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const event of events) {
        const result = await processEvent(service, event.event_id, event.event_payload ?? {});
        if (result.ok) done += 1;
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
        не_вышло: failed,
        ждут_разбора: pending ?? 0,
        сдались: givenUp ?? 0,
        ошибки: errors,
    });
}
