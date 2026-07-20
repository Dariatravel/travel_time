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

export type IcalSyncConflict = {
    external_uid: string;
    start: number;
    end: number;
    message: string;
};

export type IcalSyncFeedResult = {
    roomId: string;
    dryRun: boolean;
    parsed: number;
    upserted: number;
    pruned: number;
    conflicts: IcalSyncConflict[];
    sample: Array<{
        external_uid: string;
        start: number;
        end: number;
        comment: string;
    }>;
};

// Триггер запрета двойных броней (20260713_prevent_double_booking) отбивает
// события, пересекающиеся с ручными бронями шахматки, кодом 23P01.
// Ручная бронь главнее фида: такие события пропускаем, а не роняем синк.
const isOverlapConflict = (error: { code?: string; message?: string } | null) =>
    error?.code === '23P01' || Boolean(error?.message?.includes('Наложение броней запрещено'));

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

            // Upsert здесь не работает: BEFORE INSERT триггер запрета двойных
            // броней срабатывает до разрешения ON CONFLICT по UID и видит
            // существующую строку того же события как чужое пересечение (23P01).
            // Поэтому синхронизируем дифом: без изменений — пропускаем,
            // изменилось — UPDATE по id (триггер исключает саму строку),
            // новое — INSERT, пропавшее из фида — DELETE (pruneMissing).
            const conflicts: IcalSyncConflict[] = [];
            let pruned = 0;
            let upserted = 0;

            if (!dryRun) {
                const currentUids = new Set(events.map((event) => event.uid));
                const { data: roomReserves, error: selectError } = await supabase
                    .from('reserves')
                    .select('id, external_uid, external_source, external_feed_url, start, end, comment')
                    .eq('room_id', feed.roomId);

                if (selectError) {
                    throw new Error(selectError.message);
                }

                const allRows = roomReserves ?? [];
                const feedRows = allRows.filter(
                    (reserve) =>
                        reserve.external_source === EXTERNAL_SOURCE && reserve.external_feed_url === feed.url,
                );

                const staleReserveIds = pruneMissing
                    ? feedRows
                          .filter((reserve) => !reserve.external_uid || !currentUids.has(reserve.external_uid))
                          .map((reserve) => reserve.id)
                    : [];

                if (staleReserveIds.length > 0) {
                    const { error } = await supabase.from('reserves').delete().in('id', staleReserveIds);

                    if (error) {
                        throw new Error(error.message);
                    }

                    pruned = staleReserveIds.length;
                }

                const staleIdSet = new Set(staleReserveIds);
                const liveRows: Array<{ start: number; end: number }> = allRows.filter(
                    (reserve) => !staleIdSet.has(reserve.id),
                );
                const existingByUid = new Map(
                    feedRows
                        .filter((reserve) => reserve.external_uid && currentUids.has(reserve.external_uid))
                        .map((reserve) => [reserve.external_uid, reserve]),
                );

                // Ночи считаем как А1-триггер: полуоткрытый интервал floor(unix/86400).
                const nightSpan = (start: number, end: number) => [
                    Math.floor(start / 86400),
                    Math.floor(end / 86400),
                ];

                // Все ночи события уже заняты другими строками (дубль события в
                // фиде или бронь, созданная вебхуком) — вставлять нечего.
                const isCoveredByOthers = (row: { start: number; end: number }) => {
                    const [from, to] = nightSpan(row.start, row.end);
                    if (to <= from) return true;

                    const busyNights = new Set<number>();
                    for (const other of liveRows) {
                        if (other.end < other.start) continue;
                        const [otherFrom, otherTo] = nightSpan(other.start, other.end);
                        for (let night = Math.max(otherFrom, from); night < Math.min(otherTo, to); night += 1) {
                            busyNights.add(night);
                        }
                    }

                    return busyNights.size >= to - from;
                };

                // Сравниваем по ночам (как весь проект), а не по секундам:
                // точное время в строке может отличаться (старые прогоны,
                // вебхук), но бронь та же — перезаписывать её незачем.
                const sameNights = (left: { start: number; end: number }, right: { start: number; end: number }) =>
                    Math.floor(left.start / 86400) === Math.floor(right.start / 86400) &&
                    Math.floor(left.end / 86400) === Math.floor(right.end / 86400);

                for (const row of payload) {
                    const existing = existingByUid.get(row.external_uid);

                    if (existing) {
                        if (sameNights(existing, row)) {
                            if (existing.comment === row.comment) {
                                continue;
                            }

                            // Даты не менялись — обновляем только комментарий,
                            // чтобы не дёргать триггер проверки пересечений.
                            const { error } = await supabase
                                .from('reserves')
                                .update({
                                    comment: row.comment,
                                    edited_at: row.edited_at,
                                    edited_by: row.edited_by,
                                    external_synced_at: row.external_synced_at,
                                })
                                .eq('id', existing.id);

                            if (error) {
                                throw new Error(error.message);
                            }

                            upserted += 1;
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
                            upserted += 1;
                            existing.start = row.start;
                            existing.end = row.end;
                            existing.comment = row.comment;
                            continue;
                        }

                        if (isOverlapConflict(error)) {
                            conflicts.push({
                                external_uid: row.external_uid,
                                start: row.start,
                                end: row.end,
                                message: error.message,
                            });
                            continue;
                        }

                        throw new Error(error.message);
                    }

                    if (isCoveredByOthers(row)) {
                        continue;
                    }

                    const { error } = await supabase.from('reserves').insert(row);

                    if (!error) {
                        upserted += 1;
                        liveRows.push({ start: row.start, end: row.end });
                        continue;
                    }

                    if (isOverlapConflict(error)) {
                        conflicts.push({
                            external_uid: row.external_uid,
                            start: row.start,
                            end: row.end,
                            message: error.message,
                        });
                        continue;
                    }

                    throw new Error(error.message);
                }
            }

            return {
                roomId: feed.roomId,
                dryRun,
                parsed: events.length,
                upserted,
                pruned,
                conflicts,
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
