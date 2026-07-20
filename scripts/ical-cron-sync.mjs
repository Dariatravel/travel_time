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

// Фиксированная Москва, как toMoscowStayUnix в src/shared/lib/moscowTime.ts:
// заезд 14:00 МСК, выезд 12:00 МСК — независимо от таймзоны машины, где
// выполняется скрипт (GitHub-раннер живёт в UTC, локальная машина — в МСК).
const MOSCOW_UTC_OFFSET_HOURS = 3;
const CHECK_IN_HOUR_MSK = 14;
const CHECK_OUT_HOUR_MSK = 12;

const toNoonUnixFromIcalDate = (value, endOfStay) => {
    const dateMatch = value.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!dateMatch) return null;

    const [, year, month, day] = dateMatch;
    const hourMsk = endOfStay ? CHECK_OUT_HOUR_MSK : CHECK_IN_HOUR_MSK;

    return Math.floor(
        Date.UTC(Number(year), Number(month) - 1, Number(day), hourMsk - MOSCOW_UTC_OFFSET_HOURS) / 1000,
    );
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

// Триггер запрета двойных броней (20260713_prevent_double_booking) отбивает
// события, пересекающиеся с ручными бронями шахматки, кодом 23P01.
// Ручная бронь главнее фида: такие события пропускаем, а не роняем синк.
const isOverlapConflict = (error) =>
    error?.code === '23P01' || String(error?.message ?? '').includes('Наложение броней запрещено');

const formatStayDate = (unix) => new Date(unix * 1000).toISOString().slice(0, 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// RealtyCalendar подрезает частые запросы: 79 фидов подряд ловят сетевые сбои
// и 429/5xx. Ретраим с нарастающей паузой, 404 отдаём сразу (фида просто нет).
const fetchIcalText = async (url, attempts = 3) => {
    for (let attempt = 1; ; attempt += 1) {
        try {
            const response = await fetch(url, {
                headers: { accept: 'text/calendar,text/plain,*/*' },
                cache: 'no-store',
            });

            if (response.ok) return await response.text();

            if (response.status === 404 || attempt >= attempts) {
                throw new Error(`Failed to fetch ${url}: ${response.status}`);
            }
        } catch (error) {
            if (attempt >= attempts || /: 404$/.test(String(error?.message ?? ''))) throw error;
        }

        await sleep(attempt * 2000);
    }
};

const syncFeed = async (supabase, feed) => {
    const events = parseIcalEvents(await fetchIcalText(feed.url));
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

    // Upsert здесь не работает: BEFORE INSERT триггер запрета двойных броней
    // срабатывает до разрешения ON CONFLICT по UID и видит существующую строку
    // того же события как чужое пересечение (23P01). Поэтому синхронизируем
    // дифом: без изменений — пропускаем, изменилось — UPDATE по id (триггер
    // исключает саму строку), новое — INSERT, пропавшее из фида — DELETE.
    const currentUids = new Set(events.map((event) => event.uid));
    const { data: roomReserves, error: selectError } = await supabase
        .from('reserves')
        .select('id, external_uid, external_source, external_feed_url, start, end, comment')
        .eq('room_id', feed.roomId);

    if (selectError) throw new Error(selectError.message);

    const allRows = roomReserves ?? [];
    const feedRows = allRows.filter(
        (reserve) => reserve.external_source === EXTERNAL_SOURCE && reserve.external_feed_url === feed.url,
    );

    const staleReserveIds = feedRows
        .filter((reserve) => !reserve.external_uid || !currentUids.has(reserve.external_uid))
        .map((reserve) => reserve.id);

    if (staleReserveIds.length > 0) {
        const { error } = await supabase.from('reserves').delete().in('id', staleReserveIds);
        if (error) throw new Error(error.message);
    }

    const staleIdSet = new Set(staleReserveIds);
    const liveRows = allRows.filter((reserve) => !staleIdSet.has(reserve.id));
    const existingByUid = new Map(
        feedRows
            .filter((reserve) => reserve.external_uid && currentUids.has(reserve.external_uid))
            .map((reserve) => [reserve.external_uid, reserve]),
    );

    // Ночи считаем как А1-триггер: полуоткрытый интервал floor(unix/86400).
    const nightSpan = (start, end) => [Math.floor(start / 86400), Math.floor(end / 86400)];

    // Все ночи события уже заняты другими строками (дубль события в фиде или
    // бронь, созданная вебхуком) — вставлять нечего, это не расхождение.
    const isCoveredByOthers = (row) => {
        const [from, to] = nightSpan(row.start, row.end);
        if (to <= from) return true;

        const busyNights = new Set();
        for (const other of liveRows) {
            if (other.end < other.start) continue;
            const [otherFrom, otherTo] = nightSpan(other.start, other.end);
            for (let night = Math.max(otherFrom, from); night < Math.min(otherTo, to); night += 1) {
                busyNights.add(night);
            }
        }

        return busyNights.size >= to - from;
    };

    const conflicts = [];
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let covered = 0;

    // Сравниваем по ночам (как весь проект), а не по секундам: точное время
    // в строке может отличаться (12:00 UTC от старых прогонов, 14:00 МСК от
    // вебхука), но бронь та же — перезаписывать её незачем.
    const sameNights = (left, right) =>
        Math.floor(left.start / 86400) === Math.floor(right.start / 86400) &&
        Math.floor(left.end / 86400) === Math.floor(right.end / 86400);

    for (const row of payload) {
        const existing = existingByUid.get(row.external_uid);

        if (existing) {
            if (sameNights(existing, row)) {
                if (existing.comment === row.comment) {
                    unchanged += 1;
                    continue;
                }

                // Даты не менялись — обновляем только комментарий, чтобы не
                // дёргать триггер проверки пересечений (он реагирует на даты).
                const { error } = await supabase
                    .from('reserves')
                    .update({
                        comment: row.comment,
                        edited_at: row.edited_at,
                        edited_by: row.edited_by,
                        external_synced_at: row.external_synced_at,
                    })
                    .eq('id', existing.id);

                if (error) throw new Error(error.message);

                updated += 1;
                existing.comment = row.comment;
                continue;
            }

            const { error } = await supabase
                .from('reserves')
                .update({
                    start: row.start,
                    end: row.end,
                    comment: row.comment,
                    edited_at: row.edited_at,
                    edited_by: row.edited_by,
                    external_synced_at: row.external_synced_at,
                })
                .eq('id', existing.id);

            if (!error) {
                updated += 1;
                existing.start = row.start;
                existing.end = row.end;
                existing.comment = row.comment;
                continue;
            }

            if (isOverlapConflict(error)) {
                conflicts.push({
                    roomId: row.room_id,
                    externalUid: row.external_uid,
                    start: row.start,
                    end: row.end,
                    message: error.message,
                });
                continue;
            }

            throw new Error(error.message);
        }

        if (isCoveredByOthers(row)) {
            covered += 1;
            continue;
        }

        const { error } = await supabase.from('reserves').insert(row);

        if (!error) {
            inserted += 1;
            liveRows.push({ start: row.start, end: row.end });
            continue;
        }

        if (isOverlapConflict(error)) {
            conflicts.push({
                roomId: row.room_id,
                externalUid: row.external_uid,
                start: row.start,
                end: row.end,
                message: error.message,
            });
            continue;
        }

        throw new Error(error.message);
    }

    return {
        roomId: feed.roomId,
        parsed: events.length,
        inserted,
        updated,
        unchanged,
        covered,
        pruned: staleReserveIds.length,
        conflicts,
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
    const failures = [];

    for (const [index, feed] of feeds.entries()) {
        // Небольшая пауза между фидами: 79 запросов подряд RealtyCalendar
        // начинает резать, а чужой сервис нагружать ни к чему.
        if (index > 0) await sleep(300);

        try {
            result.push(await syncFeed(supabase, feed));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/Failed to fetch .*404/.test(message)) {
                console.warn(`Skipping feed without iCal export: ${feed.roomId} (${message})`);
                result.push({
                    roomId: feed.roomId,
                    parsed: 0,
                    inserted: 0,
                    updated: 0,
                    unchanged: 0,
                    covered: 0,
                    pruned: 0,
                    conflicts: [],
                    skipped: true,
                });
                continue;
            }

            // Сбой одного фида не должен останавливать синхронизацию остальных.
            console.error(`Feed failed: ${feed.roomId} (${message})`);
            failures.push({ roomId: feed.roomId, message });
        }
    }

    const summary = result.reduce(
        (acc, item) => {
            acc.feeds += 1;
            acc.parsed += item.parsed;
            acc.inserted += item.inserted;
            acc.updated += item.updated;
            acc.unchanged += item.unchanged;
            acc.covered += item.covered;
            acc.pruned += item.pruned;
            acc.conflicts += item.conflicts.length;
            return acc;
        },
        { feeds: 0, parsed: 0, inserted: 0, updated: 0, unchanged: 0, covered: 0, pruned: 0, conflicts: 0 },
    );

    const allConflicts = result.flatMap((item) => item.conflicts);

    for (const conflict of allConflicts) {
        console.warn(
            `Событие RealtyCalendar пропущено (пересекается с ручной бронью): room ${conflict.roomId}, ` +
                `${formatStayDate(conflict.start)} – ${formatStayDate(conflict.end)}. ${conflict.message}`,
        );
    }

    console.log(
        JSON.stringify(
            { status: failures.length > 0 ? 'partial' : 'ok', summary, failures, conflicts: allConflicts, sample: result.slice(0, 3) },
            null,
            2,
        ),
    );

    if (failures.length > 0) {
        process.exit(1);
    }
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
