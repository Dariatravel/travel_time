import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { mergeTargets, type CircleTarget, type WaitingTarget } from '../_lib/reconcileTargets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Кого перечитать при сверке с ОКО (14.09.2026, «ждущие» — 13.09.2026).
 *
 * ОКО отдаёт сообщения только по сделке или контакту. Сначала — контакты
 * чатов, где клиент написал последним и это не проверено: вебхук ОКО не
 * присылает ответы менеджеров, и без сверки «Входящие» не отличат
 * неотвеченный чат от отвеченного в ОКО. Остальные места — старому кругу:
 * контакты, которые давно не перечитывали. Отметки о выдаче ставятся тут же,
 * чтобы очередь двигалась, даже если Mac mini оборвётся на полпути.
 */

const constantEquals = (a: string, b: string): boolean => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    return left.length === right.length && timingSafeEqual(left, right);
};

export async function POST(request: NextRequest) {
    const token = process.env.OKO_OUTBOX_TOKEN;
    const given = request.headers.get('x-oko-token') ?? '';
    if (!token || !constantEquals(token, given)) {
        return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    const limit = Math.max(1, Math.min(Number(body.limit) || 2, 20));

    const service = createSupabaseServiceRoleClient();

    // Сбой выбора «ждущих» не останавливает круг: пропущенное вебхуком
    // добирать всё равно надо.
    const { data: waitingData, error: waitingError } = await service.rpc('oko_waiting_contacts_to_check', {
        p_limit: limit,
    });
    if (waitingError) console.error('Сверка: не выбрали ждущие чаты', waitingError.message);
    const waiting = (waitingData ?? []) as WaitingTarget[];

    let circle: CircleTarget[] = [];
    if (waiting.length < limit) {
        const { data, error } = await service.rpc('oko_contacts_to_reconcile', { p_limit: limit - waiting.length });
        if (error && waitingError) return NextResponse.json({ error: error.message }, { status: 502 });
        circle = (data ?? []) as CircleTarget[];
    }

    return NextResponse.json({ контакты: mergeTargets(waiting, circle, limit) });
}
