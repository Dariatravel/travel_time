import {
    getReserveHistoryActionLabel,
    getReserveHistoryChangeSummary,
    parseReserveHistoryChanges,
    type ReserveHistoryAction,
    type ReserveHistoryEntry,
} from '@/features/ReserveInfo/lib/formatReserveHistory';
import { QUERY_KEYS } from '@/shared/config/reactQuery';
import supabase from '@/shared/config/supabase';
import { useQuery } from '@tanstack/react-query';

// В ленте показываем только то, что сделал человек. Автосинки (зеркала, iCal,
// таблицы, импорты) пишут себя в историю техническим тегом в нижнем регистре
// с подчёркиваниями — mirror_shelter, bnovo_djannat, wps_villa_leona,
// travelline_pitsunda и т.д., — а менеджер подписывается именем: «Ирина
// Ковалева», «оператор Яна». Перечислять теги поимённо оказалось ненадёжно:
// список отставал от новых источников, и лента забивалась их записями.
const AUTOMATED_ACTOR_PATTERN = /^[a-z0-9_]+$/;
// Тот же фильтр на стороне базы: без него автосинки съедают лимит выборки и до
// действий менеджеров дело не доходит. Записи без автора (старые) оставляем.
const HUMAN_ONLY_FILTER = `changed_by.is.null,changed_by.not.match.${AUTOMATED_ACTOR_PATTERN.source}`;

export const isAutomatedActor = (actor?: string | null) =>
    Boolean(actor && AUTOMATED_ACTOR_PATTERN.test(actor));

export const DASHBOARD_ACTIVITY_PAGE_SIZE = 30;
export const DASHBOARD_ACTIVITY_FETCH_LIMIT = 300;

export type RecentActivityEntry = ReserveHistoryEntry & {
    guest: string;
    hotelId?: string;
    hotelTitle?: string;
    roomTitle?: string;
};

type RawActivityRow = {
    id: string;
    reserve_id: string;
    action: string;
    changed_by: string | null;
    changed_at: string;
    changes: unknown;
    reserves: {
        guest: string;
        rooms: {
            title: string;
            hotels: {
                id: string;
                title: string;
            } | null;
        } | null;
    } | null;
};

const mapActivityRow = (row: RawActivityRow): RecentActivityEntry | null => {
    if (isAutomatedActor(row.changed_by)) {
        return null;
    }

    const reserve = Array.isArray(row.reserves) ? row.reserves[0] : row.reserves;
    const room = Array.isArray(reserve?.rooms) ? reserve?.rooms[0] : reserve?.rooms;
    const hotel = Array.isArray(room?.hotels) ? room?.hotels[0] : room?.hotels;

    return {
        id: row.id,
        reserve_id: row.reserve_id,
        action: row.action as ReserveHistoryAction,
        changed_by: row.changed_by,
        changed_at: row.changed_at,
        changes: parseReserveHistoryChanges(row.changes),
        guest: reserve?.guest ?? '—',
        hotelId: hotel?.id,
        hotelTitle: hotel?.title,
        roomTitle: room?.title,
    };
};

export async function getRecentActivity(limit = DASHBOARD_ACTIVITY_FETCH_LIMIT) {
    const { data, error } = await supabase
        .from('reserve_history')
        .select(
            `
            id,
            reserve_id,
            action,
            changed_by,
            changed_at,
            changes,
            reserves (
                guest,
                rooms (
                    title,
                    hotels (
                        id,
                        title
                    )
                )
            )
        `,
        )
        .or(HUMAN_ONLY_FILTER)
        .order('changed_at', { ascending: false })
        .limit(limit);

    if (error) {
        throw new Error(error.message);
    }

    return ((data ?? []) as unknown as RawActivityRow[])
        .map(mapActivityRow)
        .filter((entry): entry is RecentActivityEntry => entry !== null);
}

export const getActivitySummary = (entry: RecentActivityEntry) => {
    const changeSummary = getReserveHistoryChangeSummary(entry.changes);

    if (entry.action === 'created') {
        return 'Бронь добавлена в шахматку';
    }

    return changeSummary || 'Данные брони обновлены';
};

export const getActivityTitle = (entry: RecentActivityEntry) => {
    return getReserveHistoryActionLabel(entry.action);
};

export const useRecentActivity = (enabled = true) =>
    useQuery({
        queryKey: QUERY_KEYS.recentActivity,
        queryFn: () => getRecentActivity(),
        enabled,
    });
