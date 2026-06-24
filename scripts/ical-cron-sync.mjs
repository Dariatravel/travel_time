#!/usr/bin/env node
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTERNAL_SOURCE = 'realtycalendar_ical';
const DEFAULT_GUEST = 'Занято (RealtyCalendar)';
const ICAL_EXPORT_BASE = 'https://realtycalendar.ru/apartments/export.ics?r=';

const loadRoomMapping = () => {
    const mappingPath = join(__dirname, '../src/app/api/realtycalendar/_lib/roomMapping.ts');
    const mappingText = readFileSync(mappingPath, 'utf8');
    const mapping = Object.fromEntries(
        [...mappingText.matchAll(/'(\d+)':\s*'([^']+)'/g)].map((match) => [match[1], match[2]]),
    );

    if (Object.keys(mapping).length === 0) {
        throw new Error('Failed to parse RealtyCalendar room mapping');
    }

    return mapping;
};

const buildFeeds = (mapping) =>
    Object.entries(mapping).map(([realtyCalendarRoomId, roomId]) => ({
        roomId,
        url: `${ICAL_EXPORT_BASE}${Buffer.from(realtyCalendarRoomId, 'utf8').toString('base64')}`,
    }));

const unfoldIcalLines = (icalText) =>
    icalText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .reduce((lines, line) => {
            if (/^[ \t]/.test(line) && lines.length > 0) {
                lines[lines.length - 1] += line.slice(1);
            } else {
                lines.push(line);
            }
            return lines;
        }, []);

const parseIcalValue = (line) => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) return null;

    return {
        key: line.slice(0, separatorIndex).split(';')[0].toUpperCase(),
        value: line.slice(separatorIndex + 1),
    };
};

const unescapeIcalText = (value) => {
    if (!value) return undefined;

    return value
        .replace(/\\n/gi, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\')
        .trim();
};

const toNoonUnixFromIcalDate = (value, endOfStay) => {
    const dateMatch = value.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!dateMatch) return null;

    const [, year, month, day] = dateMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    date.setHours(endOfStay ? 11 : 12, 0, 0, 0);

    return Math.floor(date.getTime() / 1000);
};

const hashEventUid = (seed) => createHash('sha256').update(seed).digest('hex');

const parseIcalEvents = (icalText) => {
    const lines = unfoldIcalLines(icalText);
    const events = [];
    let currentEvent = null;

    for (const line of lines) {
        const normalizedLine = line.trim();

        if (normalizedLine === 'BEGIN:VEVENT') {
            currentEvent = {};
            continue;
        }

        if (normalizedLine === 'END:VEVENT') {
            if (currentEvent) events.push(currentEvent);
            currentEvent = null;
            continue;
        }

        if (!currentEvent) continue;

        const parsed = parseIcalValue(normalizedLine);
        if (!parsed) continue;

        currentEvent[parsed.key] = parsed.value;
    }

    return events.flatMap((event) => {
        const start = event.DTSTART ? toNoonUnixFromIcalDate(event.DTSTART, false) : null;
        const end = event.DTEND ? toNoonUnixFromIcalDate(event.DTEND, true) : null;

        if (!start || !end || end <= start) return [];

        return [
            {
                uid: event.UID || hashEventUid(`${event.DTSTART}:${event.DTEND}:${event.SUMMARY ?? ''}`),
                start,
                end,
                summary: unescapeIcalText(event.SUMMARY),
                description: unescapeIcalText(event.DESCRIPTION),
            },
        ];
    });
};

const syncFeed = async (supabase, feed) => {
    const response = await fetch(feed.url, {
        headers: { accept: 'text/calendar,text/plain,*/*' },
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch ${feed.url}: ${response.status}`);
    }

    const events = parseIcalEvents(await response.text());
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
        comment: [event.summary, event.description].filter(Boolean).join('\n').slice(0, 1000),
        created_by: EXTERNAL_SOURCE,
        edited_at: syncedAt,
        edited_by: EXTERNAL_SOURCE,
        external_source: EXTERNAL_SOURCE,
        external_uid: event.uid,
        external_feed_url: feed.url,
        external_synced_at: syncedAt,
    }));

    if (payload.length > 0) {
        const { error } = await supabase.from('reserves').upsert(payload, {
            onConflict: 'external_source,room_id,external_uid',
        });

        if (error) throw new Error(error.message);
    }

    const currentUids = new Set(events.map((event) => event.uid));
    const { data: existingExternalReserves, error: selectError } = await supabase
        .from('reserves')
        .select('id, external_uid')
        .eq('external_source', EXTERNAL_SOURCE)
        .eq('room_id', feed.roomId)
        .eq('external_feed_url', feed.url);

    if (selectError) throw new Error(selectError.message);

    const staleReserveIds = (existingExternalReserves ?? [])
        .filter((reserve) => !reserve.external_uid || !currentUids.has(reserve.external_uid))
        .map((reserve) => reserve.id);

    if (staleReserveIds.length > 0) {
        const { error } = await supabase.from('reserves').delete().in('id', staleReserveIds);
        if (error) throw new Error(error.message);
    }

    return {
        roomId: feed.roomId,
        parsed: events.length,
        upserted: payload.length,
        pruned: staleReserveIds.length,
    };
};

const main = async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const feeds = buildFeeds(loadRoomMapping());
    const result = [];

    for (const feed of feeds) {
        try {
            result.push(await syncFeed(supabase, feed));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/Failed to fetch .*404/.test(message)) {
                console.warn(`Skipping feed without iCal export: ${feed.roomId} (${message})`);
                result.push({ roomId: feed.roomId, parsed: 0, upserted: 0, pruned: 0, skipped: true });
                continue;
            }

            throw error;
        }
    }

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

    console.log(JSON.stringify({ status: 'ok', summary, sample: result.slice(0, 3) }, null, 2));
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
