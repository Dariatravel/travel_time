import { createHash } from 'crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { IcalSyncFeed } from '@/app/api/realtycalendar/_lib/feeds';

export const EXTERNAL_SOURCE = 'realtycalendar_ical';
export const DEFAULT_GUEST = 'Занято (RealtyCalendar)';

type ParsedIcalEvent = {
    uid: string;
    start: number;
    end: number;
    summary?: string;
    description?: string;
};

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

const unfoldIcalLines = (icalText: string) => {
    return icalText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .reduce<string[]>((lines, line) => {
            if (/^[ \t]/.test(line) && lines.length > 0) {
                lines[lines.length - 1] += line.slice(1);
            } else {
                lines.push(line);
            }
            return lines;
        }, []);
};

const parseIcalValue = (line: string) => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) return null;

    const key = line.slice(0, separatorIndex).split(';')[0].toUpperCase();
    const value = line.slice(separatorIndex + 1);

    return { key, value };
};

const unescapeIcalText = (value?: string) => {
    if (!value) return undefined;

    return value
        .replace(/\\n/gi, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\')
        .trim();
};

const toNoonUnixFromIcalDate = (value: string, endOfStay: boolean) => {
    const dateMatch = value.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!dateMatch) return null;

    const [, year, month, day] = dateMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    date.setHours(endOfStay ? 11 : 12, 0, 0, 0);

    return Math.floor(date.getTime() / 1000);
};

const hashEventUid = (seed: string) => {
    return createHash('sha256').update(seed).digest('hex');
};

const parseIcalEvents = (icalText: string): ParsedIcalEvent[] => {
    const lines = unfoldIcalLines(icalText);
    const events: Record<string, string>[] = [];
    let currentEvent: Record<string, string> | null = null;

    lines.forEach((line) => {
        const normalizedLine = line.trim();

        if (normalizedLine === 'BEGIN:VEVENT') {
            currentEvent = {};
            return;
        }

        if (normalizedLine === 'END:VEVENT') {
            if (currentEvent) {
                events.push(currentEvent);
            }
            currentEvent = null;
            return;
        }

        if (!currentEvent) return;

        const parsed = parseIcalValue(normalizedLine);
        if (!parsed) return;

        currentEvent[parsed.key] = parsed.value;
    });

    return events.flatMap((event) => {
        const start = event.DTSTART ? toNoonUnixFromIcalDate(event.DTSTART, false) : null;
        const end = event.DTEND ? toNoonUnixFromIcalDate(event.DTEND, true) : null;

        if (!start || !end || end <= start) {
            return [];
        }

        const uid = event.UID || hashEventUid(`${event.DTSTART}:${event.DTEND}:${event.SUMMARY ?? ''}`);

        return [
            {
                uid,
                start,
                end,
                summary: unescapeIcalText(event.SUMMARY),
                description: unescapeIcalText(event.DESCRIPTION),
            },
        ];
    });
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

    return Promise.all(
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
};
