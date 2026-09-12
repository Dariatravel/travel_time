import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Кого перечитать при сверке с ОКО (14.09.2026).
 *
 * ОКО отдаёт сообщения только по сделке или контакту, поэтому сверка идёт
 * по кругу: берём контакты, которые давно не перечитывали, начиная с тех,
 * где недавно была переписка. Отметка о сверке ставится тут же, чтобы круг
 * двигался даже если Mac mini оборвётся на полпути.
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
    const { data, error } = await service.rpc('oko_contacts_to_reconcile', { p_limit: limit });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });

    return NextResponse.json({ контакты: data ?? [] });
}
