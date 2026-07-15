import { NextRequest, NextResponse } from 'next/server';

import { disabledResponse, isYandexBackendProxyEnabled } from '@/app/api/yandex-backend/_lib/featureFlag';
import { HttpError, toErrorResponse } from '@/app/api/yandex-backend/_lib/httpError';
import { deleteCacheByPrefix } from '@/app/api/yandex-backend/_lib/memoryCache';
import {
    createSupabaseServerClient,
    createSupabaseServiceRoleClient,
} from '@/app/api/yandex-backend/_lib/supabaseServer';
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
    supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
    reserve: Partial<ReserveDTO>,
) => {
    const roomId = reserve.room_id;
    const start = toReserveUnix(reserve.start);
    const end = toReserveUnix(reserve.end);

    if (!roomId || start == null || end == null) {
        throw new HttpError(400, 'Reserve room and dates are required');
    }

    const { data, error } = await supabase
        .from('reserves')
        .select('id, guest, start, end')
        .eq('room_id', roomId)
        .lt('start', end)
        .gt('end', start)
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

const assertNoRoomClosureOverlap = async (
    supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
    reserve: Partial<ReserveDTO>,
) => {
    const roomId = reserve.room_id;
    const start = toReserveUnix(reserve.start);
    const end = toReserveUnix(reserve.end);

    if (!roomId || start == null || end == null) {
        throw new HttpError(400, 'Reserve room and dates are required');
    }

    const { data, error } = await supabase
        .from('room_closures')
        .select('id, reason, start, end')
        .eq('room_id', roomId)
        .lt('start', end)
        .gt('end', start)
        .order('start', { ascending: true })
        .limit(8);

    if (error) throw error;

    const overlaps = (data ?? []).filter((item) => hasReserveNightOverlap(item, reserve));

    if (overlaps.length > 0) {
        const conflictMessage = overlaps
            .map((item) => item.reason || 'Закрыто')
            .join(', ');

        throw new HttpError(409, `Номер закрыт на выбранные даты. Конфликт: ${conflictMessage}`);
    }
};

const assertCanAccessRoom = async (
    supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
    roomId: string | undefined,
    userId: string,
    role?: string,
) => {
    if (!roomId) {
        throw new HttpError(400, 'Reserve room is required');
    }

    const { data, error } = await supabase
        .from('rooms')
        .select('id, hotels(user_id)')
        .eq('id', roomId)
        .single();

    if (error) throw error;
    if (!data) throw new HttpError(404, 'Room not found');

    const hotel = Array.isArray(data.hotels) ? data.hotels[0] : data.hotels;
    const isStaff = role === 'admin' || role === 'operator';

    if (!isStaff && hotel?.user_id !== userId) {
        throw new HttpError(403, 'Forbidden');
    }
};

export async function POST(request: NextRequest) {
    if (!isYandexBackendProxyEnabled()) {
        return disabledResponse();
    }

    const authorization = request.headers.get('authorization');
    const idempotencyKey = request.headers.get('idempotency-key');

    if (!authorization) {
        return NextResponse.json({ error: 'Authorization header is required' }, { status: 401 });
    }

    try {
        const body = (await request.json().catch(() => {
            throw new HttpError(400, 'Invalid JSON payload');
        })) as Partial<ReserveDTO>;
        const authClient = createSupabaseServerClient(authorization);
        const {
            data: { user },
            error: authError,
        } = await authClient.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createSupabaseServiceRoleClient();

        await assertCanAccessRoom(
            supabase,
            body.room_id,
            user.id,
            user.user_metadata?.role,
        );
        await assertNoReserveOverlap(supabase, body);
        await assertNoRoomClosureOverlap(supabase, body);

        const { data, error } = await supabase
            .from('reserves')
            .insert(toReservePayload(body))
            .select('*')
            .single();

        if (error) throw error;

        deleteCacheByPrefix('hotel-calendar:');

        return NextResponse.json({
            data,
            queued: false,
            idempotencyKey,
        });
    } catch (error) {
        return toErrorResponse(error, 'Failed to create reserve');
    }
}
