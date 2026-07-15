import { NextRequest, NextResponse } from 'next/server';

import { disabledResponse, isYandexBackendProxyEnabled } from '@/app/api/yandex-backend/_lib/featureFlag';
import { HttpError, toErrorResponse } from '@/app/api/yandex-backend/_lib/httpError';
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

const toReserveUnix = (value: ReserveDTO['start'] | undefined) => {
    if (value instanceof Date) return Math.floor(value.getTime() / 1000);
    return typeof value === 'number' ? value : undefined;
};

const toReserveDayIndex = (value: ReserveDTO['start'] | undefined) => {
    const unix = toReserveUnix(value);
    return unix == null ? undefined : Math.floor(unix / 86_400);
};

const hasReserveNightOverlap = (
    reserve: Partial<Pick<ReserveDTO, 'start' | 'end'>>,
    period: Partial<Pick<ReserveDTO, 'start' | 'end'>>,
) => {
    const reserveStartDay = toReserveDayIndex(reserve.start);
    const reserveEndDay = toReserveDayIndex(reserve.end);
    const periodStartDay = toReserveDayIndex(period.start);
    const periodEndDay = toReserveDayIndex(period.end);

    if (
        reserveStartDay == null ||
        reserveEndDay == null ||
        periodStartDay == null ||
        periodEndDay == null
    ) {
        return false;
    }

    return reserveStartDay < periodEndDay && reserveEndDay > periodStartDay;
};

const assertNoReserveOverlap = async (
    supabase: ReturnType<typeof createSupabaseServerClient>,
    reserveId: string,
    reserve: Partial<ReserveDTO>,
) => {
    const roomId = reserve.room_id;
    const start = toReserveUnix(reserve.start);
    const end = toReserveUnix(reserve.end);

    if (!roomId || start == null || end == null) {
        return;
    }

    const { data, error } = await supabase
        .from('reserves')
        .select('id, guest, start, end')
        .eq('room_id', roomId)
        .lt('start', end)
        .gt('end', start)
        .neq('id', reserveId)
        .order('start', { ascending: true })
        .limit(8);

    if (error) throw error;

    const overlaps = (data ?? []).filter((item) => hasReserveNightOverlap(item, reserve));

    if (overlaps.length > 0) {
        const conflictMessage = overlaps
            .map((item) => item.guest || 'Без имени')
            .join(', ');

        throw new HttpError(409, `Наложение броней запрещено. Конфликт: ${conflictMessage}`);
    }
};

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
        const body = (await request.json().catch(() => {
            throw new HttpError(400, 'Invalid JSON payload');
        })) as Partial<ReserveDTO>;
        const supabase = createSupabaseServerClient(authorization);

        await assertNoReserveOverlap(supabase, reserveId, body);

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
        return toErrorResponse(error, 'Failed to update reserve');
    }
}
