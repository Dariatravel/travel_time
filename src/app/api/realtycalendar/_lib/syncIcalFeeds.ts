import type { SupabaseClient } from '@supabase/supabase-js';

import type { IcalSyncFeed } from '@/app/api/realtycalendar/_lib/feeds';
import { parseIcalEvents } from '@/app/api/realtycalendar/_lib/icalParse';
import { deleteCacheByPrefix } from '@/app/api/yandex-backend/_lib/memoryCache';

export const EXTERNAL_SOURCE = 'realtycalendar_ical';
export const DEFAULT_GUEST = 'Занято (RealtyCalendar)';

export type IcalSyncOptions = {
    dryRun?: boolean;
    pruneMissing?: boolean;
};

export type IcalSyncFeedResult = {
    roomId: string;
    dryRun: boolean;
    parsed: number;
    upserted: number;
    pruned: number;
    sample: Array<{
        external_uid: string;
        start: number;
        end: number;
        comment: string;
    }>;
};

export const validateIcalFeeds = (feeds: IcalSyncFeed[] | undefined) => {
    if (!Array.isArray(feeds) || feeds.length === 0) {
        throw new Error('feeds must contain at least one iCalendar feed');
    }

    return feeds.map((feed) => {
        if (!feed?.roomId || !feed?.url) {
            throw new Error('Each feed must include roomId and url');
        }

        const url = new URL(feed.url);
        if (url.protocol !== 'https:') {
            throw new Error('Only https iCalendar URLs are supported');
        }

        return {
            roomId: feed.roomId,
            url: url.toString(),
        };
    });
};

export const syncIcalFeeds = async (
    supabase: SupabaseClient,
    feeds: IcalSyncFeed[],
    options: IcalSyncOptions = {},
): Promise<IcalSyncFeedResult[]> => {
    const dryRun = options.dryRun !== false;
    const pruneMissing = options.pruneMissing === true;
    const validatedFeeds = validateIcalFeeds(feeds);

    const results = await Promise.all(
        validatedFeeds.map(async (feed) => {
            const response = await fetch(feed.url, {
                headers: { accept: 'text/calendar,text/plain,*/*' },
                cache: 'no-store',
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch iCalendar feed ${feed.url}: ${response.status}`);
            }

            const icalText = await response.text();
            const events = parseIcalEvents(icalText);
            const syncedAt = new Date().toISOString();

            const payload = events.map((event) => ({
                room_id: feed.roomId,
                start: event.start,
                end: event.end,
                guest: DEFAULT_GUEST,
                phone: '',
                price: 0,
                quantity: 1,
                prepayment: null,
                comment: [event.summary, event.description]
                    .filter(Boolean)
                    .join('\n')
                    .slice(0, 1000),
                created_by: EXTERNAL_SOURCE,
                edited_at: syncedAt,
                edited_by: EXTERNAL_SOURCE,
                external_source: EXTERNAL_SOURCE,
                external_uid: event.uid,
                external_feed_url: feed.url,
                external_synced_at: syncedAt,
            }));

            if (!dryRun && payload.length > 0) {
                const { error } = await supabase.from('reserves').upsert(payload, {
                    onConflict: 'external_source,room_id,external_uid',
                });

                if (error) {
                    throw new Error(error.message);
                }
            }

            let pruned = 0;

            if (!dryRun && pruneMissing) {
                const currentUids = new Set(events.map((event) => event.uid));
                const { data: existingExternalReserves, error: selectError } = await supabase
                    .from('reserves')
                    .select('id, external_uid')
                    .eq('external_source', EXTERNAL_SOURCE)
                    .eq('room_id', feed.roomId)
                    .eq('external_feed_url', feed.url);

                if (selectError) {
                    throw new Error(selectError.message);
                }

                const staleReserveIds = (existingExternalReserves ?? [])
                    .filter((reserve) => !reserve.external_uid || !currentUids.has(reserve.external_uid))
                    .map((reserve) => reserve.id);

                if (staleReserveIds.length > 0) {
                    const { error } = await supabase.from('reserves').delete().in('id', staleReserveIds);

                    if (error) {
                        throw new Error(error.message);
                    }

                    pruned = staleReserveIds.length;
                }
            }

            return {
                roomId: feed.roomId,
                dryRun,
                parsed: events.length,
                upserted: dryRun ? 0 : payload.length,
                pruned,
                sample: payload.slice(0, 5).map((event) => ({
                    external_uid: event.external_uid,
                    start: event.start,
                    end: event.end,
                    comment: event.comment,
                })),
            };
        }),
    );

    // Сбрасываем серверный кэш календарей, если брони реально менялись,
    // чтобы шахматка обновилась сразу, не дожидаясь истечения TTL.
    if (!dryRun && results.some((result) => result.upserted > 0 || result.pruned > 0)) {
        deleteCacheByPrefix('hotel-calendar:');
    }

    return results;
};
