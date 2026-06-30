import { parseReserveHistoryChanges, type ReserveHistoryAction } from '@/features/ReserveInfo/lib/formatReserveHistory';
import { getDeletedReserves, type DeletedReserveItem } from '@/shared/api/reserve/reserve';
import { QUERY_KEYS } from '@/shared/config/reactQuery';
import supabase from '@/shared/config/supabase';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

const OPERATION_FETCH_LIMIT = 1200;
const EXTERNAL_ACTORS = new Set(['realtycalendar_ical', 'realtycalendar_webhook']);

export type OperationReserve = {
    id: string;
    roomId: string;
    hotelId?: string;
    hotelTitle: string;
    roomTitle: string;
    guest: string;
    phone: string;
    start: number;
    end: number;
    price: number;
    prepayment?: string | null;
    createdAt?: string | null;
    createdBy?: string | null;
    editedAt?: string | null;
    editedBy?: string | null;
    externalSource?: string | null;
};

export type OperationDuplicate = {
    phone: string;
    reserves: OperationReserve[];
};

export type OperationConflict = {
    roomId: string;
    hotelTitle: string;
    roomTitle: string;
    left: OperationReserve;
    right: OperationReserve;
    isExternalConflict: boolean;
};

export type OperationWebhookEvent = {
    id: string;
    receivedAt: string;
    action?: string | null;
    bookingId?: string | null;
    resultStatus: string;
    resultReason?: string | null;
    hasConflicts: boolean;
};

export type OperationActivity = {
    id: string;
    reserveId: string;
    action: ReserveHistoryAction;
    changedBy: string | null;
    changedAt: string;
    guest: string;
    hotelTitle: string;
    roomTitle: string;
    isIntegration: boolean;
    changes: ReturnType<typeof parseReserveHistoryChanges>;
};

export type OperationsCenterData = {
    todayArrivals: OperationReserve[];
    todayDepartures: OperationReserve[];
    searchResults: OperationReserve[];
    freeRooms: Array<{ id: string; title: string; hotelTitle: string }>;
    duplicates: OperationDuplicate[];
    conflicts: OperationConflict[];
    externalNewBookings: OperationReserve[];
    integrationEvents: OperationWebhookEvent[];
    activity: OperationActivity[];
    deletedReserves: DeletedReserveItem[];
    totals: {
        arrivals: number;
        departures: number;
        duplicates: number;
        conflicts: number;
        integrationErrors: number;
        freeRooms: number;
        deletedReserves: number;
    };
};

type OperationReserveRow = {
    id: string;
    room_id: string;
    start: number;
    end: number;
    guest: string | null;
    phone: string | null;
    price: number | null;
    prepayment: string | null;
    created_at: string | null;
    created_by: string | null;
    edited_at: string | null;
    edited_by: string | null;
    external_source: string | null;
    rooms:
        | {
              id: string;
              title: string | null;
              hotel_id: string | null;
              hotels:
                  | {
                        id: string;
                        title: string | null;
                    }
                  | null;
          }
        | null;
};

type OperationRoomRow = {
    id: string;
    title: string | null;
    hotels: { title: string | null } | null;
};

type OperationHistoryRow = {
    id: string;
    reserve_id: string;
    action: string;
    changed_by: string | null;
    changed_at: string;
    changes: unknown;
    reserves:
        | {
              guest: string | null;
              rooms:
                  | {
                        title: string | null;
                        hotels: { title: string | null } | null;
                    }
                  | null;
          }
        | null;
};

type OperationWebhookRow = {
    id: string;
    received_at: string;
    action: string | null;
    booking_id: string | null;
    result_status: string;
    result_reason: string | null;
    conflicts: unknown;
};

export type OperationsCenterMode =
    | 'search'
    | 'arrivalsToday'
    | 'departuresToday'
    | 'freeRooms'
    | 'duplicates'
    | 'conflicts'
    | 'integrations'
    | 'deleted';

export type OperationsCenterFilters = {
    query?: string;
    dateFrom?: Date;
    dateTo?: Date;
    freeDateFrom?: Date;
    freeDateTo?: Date;
    modes?: OperationsCenterMode[];
};

const normalizePhone = (phone: string) => phone.replace(/\D/g, '');

const emptyOperationsCenterData = (): OperationsCenterData => ({
    todayArrivals: [],
    todayDepartures: [],
    searchResults: [],
    freeRooms: [],
    duplicates: [],
    conflicts: [],
    externalNewBookings: [],
    integrationEvents: [],
    activity: [],
    deletedReserves: [],
    totals: {
        arrivals: 0,
        departures: 0,
        duplicates: 0,
        conflicts: 0,
        integrationErrors: 0,
        freeRooms: 0,
        deletedReserves: 0,
    },
});

const mapReserve = (row: OperationReserveRow): OperationReserve => {
    const room = Array.isArray(row.rooms) ? row.rooms[0] : row.rooms;
    const hotel = Array.isArray(room?.hotels) ? room?.hotels[0] : room?.hotels;

    return {
        id: row.id,
        roomId: row.room_id,
        hotelId: hotel?.id,
        hotelTitle: hotel?.title ?? 'Без отеля',
        roomTitle: room?.title ?? 'Без номера',
        guest: row.guest ?? 'Без имени',
        phone: row.phone ?? '',
        start: row.start,
        end: row.end,
        price: row.price ?? 0,
        prepayment: row.prepayment,
        createdAt: row.created_at,
        createdBy: row.created_by,
        editedAt: row.edited_at,
        editedBy: row.edited_by,
        externalSource: row.external_source,
    };
};

const overlaps = (reserve: OperationReserve, start: number, end: number) =>
    reserve.start < end && reserve.end > start;

const getDateRange = (from?: Date, to?: Date) => {
    if (!from && !to) return null;

    const start = dayjs(from ?? to).startOf('day').unix();
    const end = dayjs(to ?? from).add(1, 'day').startOf('day').unix();

    return { start, end };
};

const matchesReserveQuery = (reserve: OperationReserve, query: string) => {
    const normalizedQuery = query.trim().toLowerCase();
    const queryPhone = normalizePhone(query);

    if (!normalizedQuery) return true;

    const searchableText = [
        reserve.guest,
        reserve.phone,
        reserve.roomTitle,
        reserve.hotelTitle,
        dayjs.unix(reserve.start).format('DD.MM.YYYY'),
        dayjs.unix(reserve.start).format('DD.MM'),
        dayjs.unix(reserve.start).format('YYYY-MM-DD'),
        dayjs.unix(reserve.end).format('DD.MM.YYYY'),
        dayjs.unix(reserve.end).format('DD.MM'),
        dayjs.unix(reserve.end).format('YYYY-MM-DD'),
    ]
        .join(' ')
        .toLowerCase();

    return (
        searchableText.includes(normalizedQuery) ||
        (queryPhone.length >= 3 && normalizePhone(reserve.phone).includes(queryPhone))
    );
};

const getReserves = async (from: number, to: number) => {
    const { data, error } = await supabase
        .from('reserves')
        .select(
            `
            id,
            room_id,
            start,
            end,
            guest,
            phone,
            price,
            prepayment,
            created_at,
            created_by,
            edited_at,
            edited_by,
            external_source,
            rooms (
                id,
                title,
                hotel_id,
                hotels (
                    id,
                    title
                )
            )
        `,
        )
        .lt('start', to)
        .gt('end', from)
        .order('start', { ascending: true })
        .limit(OPERATION_FETCH_LIMIT);

    if (error) {
        throw new Error(error.message);
    }

    return ((data ?? []) as unknown as OperationReserveRow[]).map(mapReserve);
};

const getRooms = async () => {
    const { data, error } = await supabase
        .from('rooms')
        .select(
            `
            id,
            title,
            hotels (
                title
            )
        `,
        )
        .order('order', { ascending: true, nullsFirst: false });

    if (error) {
        throw new Error(error.message);
    }

    return ((data ?? []) as unknown as OperationRoomRow[]).map((room) => ({
        id: room.id,
        title: room.title ?? 'Без номера',
        hotelTitle: room.hotels?.title ?? 'Без отеля',
    }));
};

const getIntegrationEvents = async () => {
    const { data, error } = await supabase
        .from('realtycalendar_webhook_events')
        .select('id, received_at, action, booking_id, result_status, result_reason, conflicts')
        .order('received_at', { ascending: false })
        .limit(40);

    if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return [];
        throw new Error(error.message);
    }

    return ((data ?? []) as OperationWebhookRow[]).map((event) => ({
        id: event.id,
        receivedAt: event.received_at,
        action: event.action,
        bookingId: event.booking_id,
        resultStatus: event.result_status,
        resultReason: event.result_reason,
        hasConflicts:
            Array.isArray(event.conflicts) ? event.conflicts.length > 0 : Boolean(event.conflicts),
    }));
};

const getActivity = async () => {
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
                        title
                    )
                )
            )
        `,
        )
        .order('changed_at', { ascending: false })
        .limit(80);

    if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return [];
        throw new Error(error.message);
    }

    return ((data ?? []) as unknown as OperationHistoryRow[]).map((row) => {
        const reserve = Array.isArray(row.reserves) ? row.reserves[0] : row.reserves;
        const room = Array.isArray(reserve?.rooms) ? reserve.rooms[0] : reserve?.rooms;
        const hotel = Array.isArray(room?.hotels) ? room.hotels[0] : room?.hotels;

        return {
            id: row.id,
            reserveId: row.reserve_id,
            action: row.action as ReserveHistoryAction,
            changedBy: row.changed_by,
            changedAt: row.changed_at,
            guest: reserve?.guest ?? 'Без имени',
            hotelTitle: hotel?.title ?? 'Без отеля',
            roomTitle: room?.title ?? 'Без номера',
            isIntegration: row.changed_by ? EXTERNAL_ACTORS.has(row.changed_by) : false,
            changes: parseReserveHistoryChanges(row.changes),
        };
    });
};

const buildDuplicates = (reserves: OperationReserve[]) => {
    const byPhone = new Map<string, OperationReserve[]>();

    for (const reserve of reserves) {
        const phone = normalizePhone(reserve.phone);
        if (phone.length < 7) continue;

        byPhone.set(phone, [...(byPhone.get(phone) ?? []), reserve]);
    }

    return Array.from(byPhone.entries())
        .map(([phone, phoneReserves]) => ({ phone, reserves: phoneReserves }))
        .filter((group) => group.reserves.length > 1)
        .sort((left, right) => right.reserves.length - left.reserves.length)
        .slice(0, 20);
};

const buildConflicts = (reserves: OperationReserve[]) => {
    const byRoom = new Map<string, OperationReserve[]>();

    for (const reserve of reserves) {
        byRoom.set(reserve.roomId, [...(byRoom.get(reserve.roomId) ?? []), reserve]);
    }

    const conflicts: OperationConflict[] = [];

    for (const [roomId, roomReserves] of byRoom.entries()) {
        const sorted = [...roomReserves].sort((left, right) => left.start - right.start);

        for (let index = 1; index < sorted.length; index += 1) {
            const previous = sorted[index - 1];
            const current = sorted[index];

            if (current.start < previous.end) {
                conflicts.push({
                    roomId,
                    hotelTitle: current.hotelTitle,
                    roomTitle: current.roomTitle,
                    left: previous,
                    right: current,
                    isExternalConflict: Boolean(previous.externalSource || current.externalSource),
                });
            }
        }
    }

    return conflicts.slice(0, 30);
};

export async function getOperationsCenterData(
    filters: OperationsCenterFilters = {},
): Promise<OperationsCenterData> {
    const todayStart = dayjs().startOf('day').unix();
    const todayEnd = dayjs().add(1, 'day').startOf('day').unix();
    const workingStart = dayjs().subtract(14, 'day').startOf('day').unix();
    const workingEnd = dayjs().add(180, 'day').startOf('day').unix();
    const dateRange = getDateRange(filters.dateFrom, filters.dateTo);
    const freeDateRange = getDateRange(filters.freeDateFrom, filters.freeDateTo);
    const requestedModes = new Set(filters.modes ?? []);
    const normalizedQuery = filters.query?.trim() ?? '';
    const shouldSearch = requestedModes.has('search') || Boolean(normalizedQuery) || Boolean(dateRange);
    const shouldFindFreeRooms = requestedModes.has('freeRooms') && Boolean(freeDateRange);

    if (
        !shouldSearch &&
        !requestedModes.has('arrivalsToday') &&
        !requestedModes.has('departuresToday') &&
        !shouldFindFreeRooms &&
        !requestedModes.has('duplicates') &&
        !requestedModes.has('conflicts') &&
        !requestedModes.has('integrations') &&
        !requestedModes.has('deleted')
    ) {
        return emptyOperationsCenterData();
    }

    const reserveRanges: Array<{ start: number; end: number }> = [];

    if (shouldSearch) {
        reserveRanges.push(dateRange ?? { start: workingStart, end: workingEnd });
    }

    if (requestedModes.has('arrivalsToday') || requestedModes.has('departuresToday')) {
        reserveRanges.push({ start: todayStart, end: todayEnd });
    }

    if (
        requestedModes.has('duplicates') ||
        requestedModes.has('conflicts') ||
        requestedModes.has('integrations')
    ) {
        reserveRanges.push({ start: workingStart, end: workingEnd });
    }

    if (freeDateRange) {
        reserveRanges.push(freeDateRange);
    }

    const reserveRange = reserveRanges.length
        ? {
              start: Math.min(...reserveRanges.map((range) => range.start)),
              end: Math.max(...reserveRanges.map((range) => range.end)),
          }
        : null;

    const [reserves, integrationEvents, activity, deletedReserves] = await Promise.all([
        reserveRange ? getReserves(reserveRange.start, reserveRange.end) : Promise.resolve([]),
        requestedModes.has('integrations') ? getIntegrationEvents() : Promise.resolve([]),
        requestedModes.has('integrations') ? getActivity() : Promise.resolve([]),
        requestedModes.has('deleted') ? getDeletedReserves() : Promise.resolve([]),
    ]);

    const searchResults = shouldSearch
        ? reserves.filter((reserve) => {
              const matchesText = matchesReserveQuery(reserve, normalizedQuery);
              const matchesDate = dateRange
                  ? overlaps(reserve, dateRange.start, dateRange.end)
                  : true;

              return matchesText && matchesDate;
          })
        : [];

    let freeRooms: OperationsCenterData['freeRooms'] = [];

    if (shouldFindFreeRooms && freeDateRange) {
        const rooms = await getRooms();
        const busyRoomIds = new Set(
            reserves
                .filter((reserve) => overlaps(reserve, freeDateRange.start, freeDateRange.end))
                .map((reserve) => reserve.roomId),
        );

        freeRooms = rooms.filter((room) => !busyRoomIds.has(room.id)).slice(0, 80);
    }

    const todayArrivals = requestedModes.has('arrivalsToday')
        ? reserves.filter((reserve) => reserve.start >= todayStart && reserve.start < todayEnd)
        : [];
    const todayDepartures = requestedModes.has('departuresToday')
        ? reserves.filter((reserve) => reserve.end >= todayStart && reserve.end < todayEnd)
        : [];
    const duplicates = requestedModes.has('duplicates')
        ? buildDuplicates(reserves.filter((reserve) => reserve.end >= todayStart))
        : [];
    const conflicts = requestedModes.has('conflicts') ? buildConflicts(reserves) : [];
    const externalNewBookings = requestedModes.has('integrations')
        ? reserves
              .filter((reserve) => reserve.externalSource)
              .sort(
                  (left, right) =>
                      dayjs(right.createdAt).valueOf() - dayjs(left.createdAt).valueOf(),
              )
              .slice(0, 20)
        : [];
    const integrationErrors = integrationEvents.filter(
        (event) => event.resultStatus !== 'success' || event.hasConflicts,
    ).length;

    return {
        todayArrivals,
        todayDepartures,
        searchResults: searchResults.slice(0, 80),
        freeRooms,
        duplicates,
        conflicts,
        externalNewBookings,
        integrationEvents,
        activity,
        deletedReserves,
        totals: {
            arrivals: todayArrivals.length,
            departures: todayDepartures.length,
            duplicates: duplicates.length,
            conflicts: conflicts.length,
            integrationErrors,
            freeRooms: freeRooms.length,
            deletedReserves: deletedReserves.length,
        },
    };
}

export const useOperationsCenter = (filters: OperationsCenterFilters, enabled = true) =>
    useQuery({
        queryKey: [...QUERY_KEYS.operationsCenter, filters],
        queryFn: () => getOperationsCenterData(filters),
        enabled,
    });
