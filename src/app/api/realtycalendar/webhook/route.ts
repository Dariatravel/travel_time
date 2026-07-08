import { NextRequest, NextResponse } from 'next/server';

import { REALTYCALENDAR_ROOM_TO_TRAVEL_ROOM } from '@/app/api/realtycalendar/_lib/roomMapping';
import { logRealtyCalendarWebhookEvent } from '@/app/api/realtycalendar/_lib/webhookLog';
import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';

export const dynamic = 'force-dynamic';

const EXTERNAL_CREATED_BY = 'realtycalendar_webhook';
const ICAL_CREATED_BY = 'realtycalendar_ical';
const DEFAULT_GUEST = 'Занято (RealtyCalendar)';

type RealtyCalendarWebhook = {
    action?: string;
    status?: string;
    data?: {
        booking?: RealtyCalendarBooking;
    };
};

type RealtyCalendarBooking = {
    id?: number | string;
    begin_date?: string;
    end_date?: string;
    realty_id?: number | string | null;
    realty_room_id?: number | string | null;
    amount?: number | string | null;
    prepayment?: number | string | null;
    payment?: number | string | null;
    notes?: string | null;
    source?: string | null;
    url?: string | null;
    client?: {
        fio?: string | null;
        phone?: string | null;
        email?: string | null;
    } | null;
    apartment?: {
        id?: number | string | null;
        title?: string | null;
    } | null;
};

type ReserveRow = {
    id: string;
    start: number;
    end: number;
    guest: string;
    created_by: string | null;
    comment: string | null;
};

const getTokenFromRequest = (request: NextRequest) => {
    return request.nextUrl.searchParams.get('token') || request.headers.get('x-realtycalendar-token');
};

const isAuthorized = (request: NextRequest) => {
    const expectedToken = process.env.REALTYCALENDAR_WEBHOOK_TOKEN;
    const actualToken = getTokenFromRequest(request);

    return Boolean(expectedToken && actualToken && actualToken === expectedToken);
};

const parseBookingDate = (value: string | undefined, endOfStay: boolean) => {
    if (!value) return null;

    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;

    const date = new Date(year, month - 1, day);
    date.setHours(endOfStay ? 12 : 14, 0, 0, 0);

    return Math.floor(date.getTime() / 1000);
};

const overlaps = (left: { start: number; end: number }, right: { start: number; end: number }) => {
    return left.start < right.end && right.start < left.end;
};

const isExternalReserve = (reserve: ReserveRow) => {
    return reserve.created_by === EXTERNAL_CREATED_BY || reserve.created_by === ICAL_CREATED_BY;
};

const getBookingTag = (bookingId: string) => `RealtyCalendar booking: ${bookingId}`;

const getMappedRoomId = (booking: RealtyCalendarBooking) => {
    const realtyRoomId = booking.realty_room_id == null ? null : String(booking.realty_room_id);
    const realtyId = booking.realty_id == null ? null : String(booking.realty_id);

    if (realtyRoomId && REALTYCALENDAR_ROOM_TO_TRAVEL_ROOM[realtyRoomId]) {
        return {
            realtyRoomId,
            roomId: REALTYCALENDAR_ROOM_TO_TRAVEL_ROOM[realtyRoomId],
        };
    }

    if (realtyId && REALTYCALENDAR_ROOM_TO_TRAVEL_ROOM[realtyId]) {
        return {
            realtyRoomId: realtyId,
            roomId: REALTYCALENDAR_ROOM_TO_TRAVEL_ROOM[realtyId],
        };
    }

    return {
        realtyRoomId,
        roomId: null,
    };
};

const toNumber = (value: number | string | null | undefined) => {
    if (value == null || value === '') return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const buildComment = (booking: RealtyCalendarBooking, bookingId: string, realtyRoomId: string | null) => {
    return [
        getBookingTag(bookingId),
        realtyRoomId ? `RC room: ${realtyRoomId}` : null,
        booking.realty_id ? `RC realty: ${booking.realty_id}` : null,
        booking.apartment?.title ? `Object: ${booking.apartment.title}` : null,
        booking.source ? `Source: ${booking.source}` : null,
        booking.notes ? `Notes: ${booking.notes}` : null,
        booking.url ? `URL: ${booking.url}` : null,
    ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 1000);
};

export async function POST(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let payload: RealtyCalendarWebhook;

    try {
        payload = (await request.json()) as RealtyCalendarWebhook;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const booking = payload.data?.booking;
    const bookingId = booking?.id == null ? null : String(booking.id);

    if (!booking || !bookingId) {
        const supabase = createSupabaseServiceRoleClient();
        await logRealtyCalendarWebhookEvent(supabase, {
            action: payload.action,
            status: payload.status,
            resultStatus: 'skipped',
            resultReason: 'Booking payload is missing',
            payload,
        });

        return NextResponse.json({ status: 'skipped', reason: 'Booking payload is missing' });
    }

    const action = payload.action ?? '';
    const { roomId, realtyRoomId } = getMappedRoomId(booking);
    const supabase = createSupabaseServiceRoleClient();

    if (!roomId) {
        console.warn('RealtyCalendar webhook skipped: unmapped room', {
            bookingId,
            action,
            realty_room_id: realtyRoomId,
            realty_id: booking.realty_id,
        });

        await logRealtyCalendarWebhookEvent(supabase, {
            action,
            status: payload.status,
            bookingId,
            rcRoomId: realtyRoomId,
            rcRealtyId: booking.realty_id == null ? null : String(booking.realty_id),
            resultStatus: 'skipped',
            resultReason: 'RealtyCalendar room is not mapped',
            payload,
        });

        return NextResponse.json({
            status: 'skipped',
            reason: 'RealtyCalendar room is not mapped',
            realty_room_id: realtyRoomId,
            realty_id: booking.realty_id,
        });
    }

    const bookingTag = getBookingTag(bookingId);

    const { data: roomReserves, error: reservesError } = await supabase
        .from('reserves')
        .select('id, start, end, guest, created_by, comment')
        .eq('room_id', roomId);

    if (reservesError) {
        return NextResponse.json({ error: reservesError.message }, { status: 500 });
    }

    const existingReserves = (roomReserves ?? []) as ReserveRow[];
    const taggedExternalReserveIds = existingReserves
        .filter((reserve) => isExternalReserve(reserve) && reserve.comment?.includes(bookingTag))
        .map((reserve) => reserve.id);

    if (['cancel_booking', 'delete_booking'].includes(action) || payload.status === 'deleted') {
        const idsToDelete = [...taggedExternalReserveIds];
        const start = parseBookingDate(booking.begin_date, false);
        const end = parseBookingDate(booking.end_date, true);

        if (idsToDelete.length === 0 && start && end) {
            existingReserves
                .filter((reserve) => isExternalReserve(reserve) && overlaps({ start, end }, reserve))
                .forEach((reserve) => idsToDelete.push(reserve.id));
        }

        if (idsToDelete.length > 0) {
            const { error } = await supabase.from('reserves').delete().in('id', idsToDelete);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        }

        await logRealtyCalendarWebhookEvent(supabase, {
            action,
            status: payload.status,
            bookingId,
            roomId,
            rcRoomId: realtyRoomId,
            rcRealtyId: booking.realty_id == null ? null : String(booking.realty_id),
            resultStatus: 'deleted',
            payload,
        });

        return NextResponse.json({
            status: 'deleted',
            booking_id: bookingId,
            deleted: idsToDelete.length,
        });
    }

    const start = parseBookingDate(booking.begin_date, false);
    const end = parseBookingDate(booking.end_date, true);

    if (!start || !end || end <= start) {
        await logRealtyCalendarWebhookEvent(supabase, {
            action,
            status: payload.status,
            bookingId,
            roomId,
            rcRoomId: realtyRoomId,
            rcRealtyId: booking.realty_id == null ? null : String(booking.realty_id),
            resultStatus: 'skipped',
            resultReason: 'Booking dates are invalid',
            payload,
        });

        return NextResponse.json({ status: 'skipped', reason: 'Booking dates are invalid' });
    }

    const nextReserve = { start, end };
    const conflictingOwnReserves = existingReserves.filter(
        (reserve) =>
            !isExternalReserve(reserve) &&
            !taggedExternalReserveIds.includes(reserve.id) &&
            overlaps(nextReserve, reserve),
    );

    if (conflictingOwnReserves.length > 0) {
        console.warn('RealtyCalendar webhook conflict', {
            bookingId,
            action,
            roomId,
            start,
            end,
            conflicts: conflictingOwnReserves.map((reserve) => ({
                id: reserve.id,
                guest: reserve.guest,
                start: reserve.start,
                end: reserve.end,
            })),
        });

        const conflictPayload = conflictingOwnReserves.map((reserve) => ({
            id: reserve.id,
            guest: reserve.guest,
            start: reserve.start,
            end: reserve.end,
        }));

        await logRealtyCalendarWebhookEvent(supabase, {
            action,
            status: payload.status,
            bookingId,
            roomId,
            rcRoomId: realtyRoomId,
            rcRealtyId: booking.realty_id == null ? null : String(booking.realty_id),
            resultStatus: 'conflict',
            payload,
            conflicts: conflictPayload,
        });

        return NextResponse.json({
            status: 'conflict',
            booking_id: bookingId,
            room_id: roomId,
            conflicts: conflictPayload,
        });
    }

    const overlappingExternalReserveIds = existingReserves
        .filter((reserve) => isExternalReserve(reserve) && overlaps(nextReserve, reserve))
        .map((reserve) => reserve.id);
    const idsToReplace = Array.from(new Set([...taggedExternalReserveIds, ...overlappingExternalReserveIds]));

    if (idsToReplace.length > 0) {
        const { error } = await supabase.from('reserves').delete().in('id', idsToReplace);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }

    const { data: insertedReserve, error: insertError } = await supabase
        .from('reserves')
        .insert({
            room_id: roomId,
            start,
            end,
            guest: booking.client?.fio || DEFAULT_GUEST,
            phone: booking.client?.phone || '',
            price: toNumber(booking.amount),
            quantity: 1,
            prepayment: booking.prepayment == null ? null : String(booking.prepayment),
            comment: buildComment(booking, bookingId, realtyRoomId),
            created_by: EXTERNAL_CREATED_BY,
            edited_at: new Date().toISOString(),
            edited_by: EXTERNAL_CREATED_BY,
        })
        .select('id')
        .single();

    if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    await logRealtyCalendarWebhookEvent(supabase, {
        action,
        status: payload.status,
        bookingId,
        roomId,
        rcRoomId: realtyRoomId,
        rcRealtyId: booking.realty_id == null ? null : String(booking.realty_id),
        resultStatus: 'upserted',
        payload,
    });

    return NextResponse.json({
        status: 'upserted',
        booking_id: bookingId,
        room_id: roomId,
        reserve_id: insertedReserve?.id,
        replaced_external: idsToReplace.length,
    });
}

