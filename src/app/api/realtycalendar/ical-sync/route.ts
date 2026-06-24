import { NextRequest, NextResponse } from 'next/server';

import type { IcalSyncFeed } from '@/app/api/realtycalendar/_lib/feeds';
import { syncIcalFeeds } from '@/app/api/realtycalendar/_lib/syncIcalFeeds';
import { createSupabaseServerClient } from '@/app/api/yandex-backend/_lib/supabaseServer';

export const dynamic = 'force-dynamic';

type SyncRequestBody = {
    feeds?: IcalSyncFeed[];
    dryRun?: boolean;
    pruneMissing?: boolean;
};

export async function POST(request: NextRequest) {
    const authorization = request.headers.get('authorization');

    if (!authorization) {
        return NextResponse.json({ error: 'Authorization header is required' }, { status: 401 });
    }

    try {
        const body = (await request.json()) as SyncRequestBody;
        const supabase = createSupabaseServerClient(authorization);
        const result = await syncIcalFeeds(supabase, body.feeds ?? [], {
            dryRun: body.dryRun,
            pruneMissing: body.pruneMissing,
        });

        return NextResponse.json({ result });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to sync iCalendar feeds';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
