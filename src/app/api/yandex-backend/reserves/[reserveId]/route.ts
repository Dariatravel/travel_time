import { NextRequest, NextResponse } from 'next/server';

import { disabledResponse, isYandexBackendProxyEnabled } from '@/app/api/yandex-backend/_lib/featureFlag';
import { deleteCacheByPrefix } from '@/app/api/yandex-backend/_lib/memoryCache';
import { createSupabaseServerClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import type { ReserveDTO } from '@/shared/api/reserve/reserve';

export const dynamic = 'force-dynamic';

const toReservePayload = (reserve: Partial<ReserveDTO>) => ({
    room_id: reserve.room_id,
    start: reserve.start,
    end: reserve.end,
    guest: reserve.guest,
    phone: reserve.phone,
    price: reserve.price,
    quantity: reserve.quantity,
    prepayment: reserve.prepayment == null ? null : String(reserve.prepayment),
    comment: reserve.comment ?? '',
    created_at: reserve.created_at,
    created_by: reserve.created_by,
    edited_at: reserve.edited_at,
    edited_by: reserve.edited_by,
    is_fixed: reserve.is_fixed ?? false,
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ reserveId: string }> },
) {
    if (!isYandexBackendProxyEnabled()) {
        return disabledResponse();
    }

    const { reserveId } = await params;
    const authorization = request.headers.get('authorization');
    const idempotencyKey = request.headers.get('idempotency-key');

    if (!authorization) {
        return NextResponse.json({ error: 'Authorization header is required' }, { status: 401 });
    }

    try {
        const body = (await request.json()) as Partial<ReserveDTO>;
        const supabase = createSupabaseServerClient(authorization);

        const { data, error } = await supabase
            .from('reserves')
            .update(toReservePayload(body))
            .eq('id', reserveId)
            .select('id, room_id')
            .single();

        if (error) throw error;

        deleteCacheByPrefix('hotel-calendar:');

        return NextResponse.json({
            data,
            queued: false,
            idempotencyKey,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update reserve';
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
