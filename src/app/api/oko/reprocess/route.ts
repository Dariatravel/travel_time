import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { processEvent, type OkoEventBody } from '../_lib/processEvent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Повторный разбор событий ОКО (14.09.2026, по внешнему ревью).
 *
 * Событие сохраняется сырым до разбора. Если разбор не удался (база была
 * занята, клиент не завёлся), раньше оно оставалось лежать навсегда. Теперь
 * Mac mini раз в несколько минут зовёт этот адрес, и события разбираются
 * повторно с растущими паузами. После десяти попыток событие остаётся
 * человеку — видно в списке ошибок.
 *
 * Запросов в ОКО не делает: разбирает то, что уже у нас. Защита — тот же
 * общий секрет очереди, что у отправителя.
 */

// По 8 событий за раз: каждое — три-четыре обращения к базе, а у контейнера
// на весь запрос 30 секунд. Не разобрали — возьмём в следующий заход.
const MAX_BATCH = 8;

const constantEquals = (a: string, b: string): boolean => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    return left.length === right.length && timingSafeEqual(left, right);
};

const authorized = (request: NextRequest): boolean => {
    const token = process.env.OKO_OUTBOX_TOKEN;
    const given = request.headers.get('x-oko-token') ?? '';

    return !!token && constantEquals(token, given);
};

export async function POST(request: NextRequest) {
    if (!authorized(request)) {
        return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc('oko_events_to_retry', { p_limit: MAX_BATCH });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 502 });
    }

    const events = (data ?? []) as { oko_message_id: number; payload: OkoEventBody; attempts: number }[];
    let done = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const event of events) {
        const result = await processEvent(service, event.oko_message_id, event.payload ?? {});
        if (result.ok) done += 1;
        else {
            failed += 1;
            if (errors.length < 5) errors.push(`${event.oko_message_id}: ${result.error}`);
        }
    }

    // Сколько всего ждёт разбора и сколько уже сдалось — для сторожа.
    const { count: pending } = await service
        .from('oko_webhook_events')
        .select('oko_message_id', { count: 'exact', head: true })
        .is('processed_at', null);
    const { count: givenUp } = await service
        .from('oko_webhook_events')
        .select('oko_message_id', { count: 'exact', head: true })
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
