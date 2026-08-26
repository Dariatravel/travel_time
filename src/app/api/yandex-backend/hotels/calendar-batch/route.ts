import { NextRequest, NextResponse } from 'next/server';

import { getCached, setCached } from '@/app/api/yandex-backend/_lib/memoryCache';
import { withRetry } from '@/app/api/yandex-backend/_lib/retry';
import {
    createSupabaseServerClient,
    createSupabaseServiceRoleClient,
} from '@/app/api/yandex-backend/_lib/supabaseServer';
import type { HotelRoomsReservesDTO } from '@/shared/api/hotel/hotel';

import {
    buildCalendarBatchRows,
    chunkCalendarIds,
    createCalendarBatchCacheKey,
    filterHotelsForCalendarAccess,
    parseCalendarBatchItems,
    type CalendarBatchAccessLevel,
} from './calendarBatch';

export const dynamic = 'force-dynamic';

const DEFAULT_CACHE_TTL_MS = 10_000;

export async function POST(request: NextRequest) {
    const startedAt = performance.now();
    const authorization = request.headers.get('authorization');

    if (!authorization) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let items;
    try {
        items = parseCalendarBatchItems(await request.json());
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid calendar batch payload';
        return NextResponse.json({ error: message }, { status: 400 });
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
    const { data: roleRow, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

    if (roleError) {
        return NextResponse.json({ error: 'Unable to verify calendar access' }, { status: 502 });
    }

    const accessLevel: CalendarBatchAccessLevel =
        roleRow?.role === 'admin' || roleRow?.role === 'operator' ? 'staff' : 'owner';
    const cacheKey = createCalendarBatchCacheKey(items, user.id, accessLevel);
    const cached = getCached<HotelRoomsReservesDTO[]>(cacheKey);

    if (cached) {
        return NextResponse.json(
            { hotels: cached },
            {
                headers: {
                    'server-timing': 'calendar-batch-cache;desc="hit"',
                    'x-calendar-batch-size': String(cached.length),
                    'x-yandex-backend-cache': 'hit',
                },
            },
        );
    }

    try {
        const result = await withRetry(async () => {
            const hotelChunks = chunkCalendarIds(items.map((item) => item.hotelId));
            const hotelResponses = await Promise.all(
                hotelChunks.map(async (hotelIds) => {
                    let query = supabase
                        .from('hotels_with_rooms_new')
                        .select('*')
                        .in('id', hotelIds);
                    if (accessLevel === 'owner') query = query.eq('user_id', user.id);

                    const { data, error } = await query;
                    if (error) throw error;
                    return data ?? [];
                }),
            );
            const accessibleHotels = filterHotelsForCalendarAccess(
                hotelResponses.flat(),
                user.id,
                accessLevel,
            );
            const accessibleHotelIds = accessibleHotels.map((hotel) => hotel.id);

            if (accessibleHotelIds.length === 0) return [];

            const roomResponses = await Promise.all(
                chunkCalendarIds(accessibleHotelIds).map(async (hotelIds) => {
                    const { data, error } = await supabase
                        .from('rooms')
                        .select('*, reserves(*)')
                        .in('hotel_id', hotelIds)
                        .order('order', { ascending: true, nullsFirst: false });
                    if (error) throw error;
                    return data ?? [];
                }),
            );

            return buildCalendarBatchRows(items, accessibleHotels, roomResponses.flat());
        });

        const cacheTtlMs = Number(
            process.env.YANDEX_BACKEND_PROXY_CACHE_TTL_MS ?? DEFAULT_CACHE_TTL_MS,
        );
        setCached(cacheKey, result, cacheTtlMs);

        return NextResponse.json(
            { hotels: result },
            {
                headers: {
                    'server-timing': `calendar-batch;dur=${(performance.now() - startedAt).toFixed(1)}`,
                    'x-calendar-batch-size': String(result.length),
                    'x-yandex-backend-cache': 'miss',
                },
            },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load hotel calendars';
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
