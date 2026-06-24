import { NextRequest, NextResponse } from 'next/server';

import { getRealtyCalendarIcalFeeds } from '@/app/api/realtycalendar/_lib/feeds';
import { syncIcalFeeds } from '@/app/api/realtycalendar/_lib/syncIcalFeeds';
import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';

export const dynamic = 'force-dynamic';

const getCronSecret = () => {
    return process.env.REALTYCALENDAR_CRON_SECRET || process.env.REALTYCALENDAR_WEBHOOK_TOKEN;
};

const isAuthorized = (request: NextRequest) => {
    const expectedSecret = getCronSecret();
    if (!expectedSecret) return false;

    const authorization = request.headers.get('authorization');
    if (authorization === `Bearer ${expectedSecret}`) {
        return true;
    }

    return request.nextUrl.searchParams.get('token') === expectedSecret;
};

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = createSupabaseServiceRoleClient();
        const feeds = getRealtyCalendarIcalFeeds();
        const result = await syncIcalFeeds(supabase, feeds, {
            dryRun: false,
            pruneMissing: true,
        });

        const summary = result.reduce(
            (acc, item) => {
                acc.feeds += 1;
                acc.parsed += item.parsed;
                acc.upserted += item.upserted;
                acc.pruned += item.pruned;
                return acc;
            },
            { feeds: 0, parsed: 0, upserted: 0, pruned: 0 },
        );

        return NextResponse.json({
            status: 'ok',
            summary,
            result,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to run iCalendar cron sync';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    return GET(request);
}
