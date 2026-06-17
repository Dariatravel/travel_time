import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';

export const dynamic = 'force-dynamic';

const EXTERNAL_CREATED_BY = 'realtycalendar_webhook';
const ICAL_CREATED_BY = 'realtycalendar_ical';
const DEFAULT_GUEST = 'Занято (RealtyCalendar)';

const REALTYCALENDAR_ROOM_TO_TRAVEL_ROOM: Record<string, string> = {
    // Рита: домики 1-7
    '95944': '17b50fbb-c925-4434-84a6-92353cee6712',
    '95945': '445d48c4-1562-48d0-8be9-31dd8257199f',
    '95946': '44810727-acb0-457c-838f-dbadd8dd6d9a',
    '95947': 'd9771a12-8b64-416a-b34b-87dc3b777e8f',
    '95948': '996d1a56-2e8a-4b9b-9290-0f1e042fdaf9',
    '95949': 'c65cc81b-b6d5-48d9-a12f-4c6057da6b07',
    '95950': 'e01e64af-a9da-4d09-be76-b35ac49daeb0',
    // Рита: апарты с кухней 1-2
    '95951': '64b7cc39-926f-4608-8d85-c56ec5340ac4',
    '95952': '43ab9a15-fd38-4911-b5d1-592be841e6a5',
    // Александрия: домики 1-11
    '109064': '9d36772c-cef8-4c29-b2b6-ef720d743cff',
    '109065': '4692f638-a62c-4858-8d2b-7a03e49e6c96',
    '109066': '7325cde0-fd5a-406b-b450-738670238b8a',
    '109067': '7de4cc07-f8a8-44ba-b9f7-83727da10083',
    '109068': 'd92fd7da-15e1-496e-8c06-1e1b95978f8c',
    '109069': 'e58da10d-4ebe-4928-83f2-46ca2e8fb8cc',
    '109070': '215ac8b2-ccba-4b59-8c73-38defc1e4399',
    '109071': 'ee9ea528-4d91-4a68-ba0f-789ac0eae01c',
    '109072': 'e54af704-fe0a-445c-ab11-0140e9eae1eb',
    '109073': '9f8f1326-a452-4871-a8fc-ec550913ed00',
    '109074': 'b5d56c33-04be-41e5-be8d-5782b18c82f3',
};

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
    date.setHours(endOfStay ? 11 : 12, 0, 0, 0);

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

    if (realtyRoomId && REALTYCALENDAR_ROOM_TO_TRAVEL_ROOM[realtyRoomId]) {
        return {
            realtyRoomId,
            roomId: REALTYCALENDAR_ROOM_TO_TRAVEL_ROOM[realtyRoomId],
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
        return NextResponse.json({ status: 'skipped', reason: 'Booking payload is missing' });
    }

    const action = payload.action ?? '';
    const { roomId, realtyRoomId } = getMappedRoomId(booking);

    if (!roomId) {
        console.warn('RealtyCalendar webhook skipped: unmapped room', {
            bookingId,
            action,
            realty_room_id: realtyRoomId,
            realty_id: booking.realty_id,
        });

        return NextResponse.json({
            status: 'skipped',
            reason: 'RealtyCalendar room is not mapped',
            realty_room_id: realtyRoomId,
            realty_id: booking.realty_id,
        });
    }

    const supabase = createSupabaseServiceRoleClient();
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

        return NextResponse.json({
            status: 'deleted',
            booking_id: bookingId,
            deleted: idsToDelete.length,
        });
    }

    const start = parseBookingDate(booking.begin_date, false);
    const end = parseBookingDate(booking.end_date, true);

    if (!start || !end || end <= start) {
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

        return NextResponse.json({
            status: 'conflict',
            booking_id: bookingId,
            room_id: roomId,
            conflicts: conflictingOwnReserves.map((reserve) => ({
                id: reserve.id,
                guest: reserve.guest,
                start: reserve.start,
                end: reserve.end,
            })),
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

    return NextResponse.json({
        status: 'upserted',
        booking_id: bookingId,
        room_id: roomId,
        reserve_id: insertedReserve?.id,
        replaced_external: idsToReplace.length,
    });
}

