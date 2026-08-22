import { NextRequest, NextResponse } from 'next/server';

import { getCached, setCached } from '@/app/api/yandex-backend/_lib/memoryCache';
import { withRetry } from '@/app/api/yandex-backend/_lib/retry';
import {
    createSupabaseServerClient,
    createSupabaseServiceRoleClient,
} from '@/app/api/yandex-backend/_lib/supabaseServer';
import type { HotelRoomsReservesDTO } from '@/shared/api/hotel/hotel';
import type { ReserveDTO } from '@/shared/api/reserve/reserve';
import type { RoomReserves } from '@/shared/api/room/room';

export const dynamic = 'force-dynamic';

const DEFAULT_CACHE_TTL_MS = 10_000;

type SupabaseRoom = {
    id: string;
    hotel_id: string;
    title: string;
    price: number;
    quantity: number;
    image_title?: string | null;
    image_path?: string | null;
    comment?: string | null;
    room_features?: string[] | null;
    order?: number | null;
    reserves?: ReserveDTO[] | null;
    [key: string]: unknown;
};

const parseAllowedRooms = (request: NextRequest) => {
    const allowedRooms = request.nextUrl.searchParams.get('allowedRooms');

    if (!allowedRooms) return undefined;

    return allowedRooms
        .split(',')
        .map((roomId) => roomId.trim())
        .filter(Boolean);
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ hotelId: string }> },
) {
    const { hotelId } = await params;
    const allowedRooms = parseAllowedRooms(request);
    const authorization = request.headers.get('authorization');

    if (!authorization) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authClient = createSupabaseServerClient(authorization);
    const {
        data: { user },
        error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const [{ data: roleRow, error: roleError }, { data: hotelScope, error: hotelScopeError }] =
        await Promise.all([
            supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
            supabase.from('hotels').select('user_id').eq('id', hotelId).maybeSingle(),
        ]);

    if (roleError || hotelScopeError) {
        return NextResponse.json({ error: 'Unable to verify calendar access' }, { status: 502 });
    }

    if (!hotelScope) {
        return NextResponse.json({ error: 'Hotel not found' }, { status: 404 });
    }

    const isStaff = roleRow?.role === 'admin' || roleRow?.role === 'operator';
    const accessLevel = isStaff ? 'staff' : hotelScope.user_id === user.id ? 'owner' : null;

    if (!accessLevel) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const cacheTtlMs = Number(process.env.YANDEX_BACKEND_PROXY_CACHE_TTL_MS ?? DEFAULT_CACHE_TTL_MS);
    const cacheKey = [
        'hotel-calendar',
        hotelId,
        allowedRooms?.slice().sort().join(',') ?? 'all',
        user.id,
        accessLevel,
    ].join(':');

    const cached = getCached<HotelRoomsReservesDTO>(cacheKey);
    if (cached) {
        return NextResponse.json(cached, {
            headers: { 'x-yandex-backend-cache': 'hit' },
        });
    }

    try {
        const result = await withRetry(async () => {
            const { data: hotelData, error: hotelError } = await supabase
                .from('hotels_with_rooms_new')
                .select('*, rooms(*)')
                .eq('id', hotelId)
                .single();

            if (hotelError) throw hotelError;
            if (!hotelData) throw new Error(`Hotel with id ${hotelId} not found`);

            let filteredRooms = (hotelData.rooms ?? []) as SupabaseRoom[];
            if (allowedRooms && allowedRooms.length > 0) {
                filteredRooms = filteredRooms.filter((room) => allowedRooms.includes(room.id));
            } else if (allowedRooms && allowedRooms.length === 0) {
                filteredRooms = [];
            }

            const roomQuery = supabase
                .from('rooms')
                .select('*, reserves(*)')
                .eq('hotel_id', hotelId);

            if (allowedRooms && allowedRooms.length > 0) {
                roomQuery.in('id', allowedRooms);
            }

            roomQuery.order('order', { ascending: true, nullsFirst: false });
            const { data: roomsData, error: roomsError } = await roomQuery;

            if (roomsError) throw roomsError;

            const roomsWithReserves = ((roomsData ?? []) as SupabaseRoom[]).map((room) => ({
                ...room,
                id: room.id,
                hotel_id: room.hotel_id,
                title: room.title,
                price: room.price,
                quantity: room.quantity,
                image_title: room.image_title || '',
                image_path: room.image_path || '',
                comment: room.comment,
                room_features: room.room_features || [],
                order: room.order || 0,
                reserves: (room.reserves || []) as ReserveDTO[],
            })) as RoomReserves[];

            const rooms = filteredRooms.map((room) => {
                return roomsWithReserves.find((roomWithReserve) => roomWithReserve.id === room.id) ?? {
                    ...room,
                    reserves: [],
                };
            });

            const sortedRooms = [...rooms].sort((a, b) => {
                const orderA = a.order ?? 999;
                const orderB = b.order ?? 999;
                return orderA - orderB;
            });

            return {
                ...hotelData,
                rooms: sortedRooms,
            } as HotelRoomsReservesDTO;
        });

        setCached(cacheKey, result, cacheTtlMs);

        return NextResponse.json(result, {
            headers: { 'x-yandex-backend-cache': 'miss' },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load hotel calendar';
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
