import { getDateFromUnix } from '@/shared/lib/date';
import { getDate } from '@/shared/lib/getDate';
import { QUERY_KEYS } from '@/shared/config/reactQuery';
import supabase from '@/shared/config/supabase';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    hasTimelineBlockOverlap,
    type TimelineBlockEntry,
} from '@/features/BaseCalendar/lib/timelineBlocks';
import { getReserveDurationDays } from '@/features/BaseCalendar/lib/reserveMove';
import { isValidReserveFormPeriod, serializeReserveFormDates } from '@/features/ReserveInfo/lib/reserveDateForm';

export type RoomClosureDTO = {
    id: string;
    room_id: string;
    start: number;
    end: number;
    reason?: string | null;
    created_at?: string;
    created_by?: string | null;
    edited_at?: string | null;
    edited_by?: string | null;
};

export type RoomClosureInput = {
    room_id: string;
    start: number;
    end: number;
    reason?: string | null;
    created_at?: string;
    created_by?: string | null;
    edited_at?: string | null;
    edited_by?: string | null;
};

export type RoomClosureFormPayload = {
    room_id: string;
    date: [Date, Date];
    reason?: string;
    created_by?: string;
    edited_by?: string;
};

export const serializeRoomClosureDates = (date: [Date, Date]) => serializeReserveFormDates(date);

export const validateRoomClosurePeriod = (start: Date, end: Date) =>
    isValidReserveFormPeriod(start, end);

export async function getRoomClosuresByHotel(hotelId: string): Promise<RoomClosureDTO[]> {
    const { data: rooms, error: roomsError } = await supabase
        .from('rooms')
        .select('id')
        .eq('hotel_id', hotelId);

    if (roomsError) {
        throw new Error(roomsError.message);
    }

    const roomIds = (rooms ?? []).map((room) => room.id);
    if (roomIds.length === 0) {
        return [];
    }

    const { data, error } = await supabase
        .from('room_closures')
        .select('*')
        .in('room_id', roomIds)
        .order('start', { ascending: true });

    if (error) {
        throw new Error(error.message);
    }

    return (data ?? []) as RoomClosureDTO[];
}

export const useRoomClosuresByHotel = (hotelId?: string, enabled = true) =>
    useQuery({
        queryKey: hotelId ? QUERY_KEYS.roomClosuresByHotel(hotelId) : ['roomClosures', 'none'],
        queryFn: () => {
            if (!hotelId) {
                throw new Error('Hotel ID is required');
            }
            return getRoomClosuresByHotel(hotelId);
        },
        enabled: enabled && !!hotelId,
        staleTime: 30_000,
    });

const invalidateHotelCalendar = async (
    queryClient: ReturnType<typeof useQueryClient>,
    hotelId: string,
) => {
    await Promise.all([
        queryClient.invalidateQueries({
            queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotelId],
        }),
        queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.roomClosuresByHotel(hotelId),
        }),
        queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.hotelDetail(hotelId),
        }),
    ]);
};

export const createRoomClosureApi = async (
    payload: RoomClosureInput,
    blockedEntries: TimelineBlockEntry[],
) => {
    if (hasTimelineBlockOverlap(blockedEntries, payload.room_id, payload.start, payload.end)) {
        throw new Error('На выбранные даты уже есть бронь или закрытие');
    }

    const { data, error } = await supabase
        .from('room_closures')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        throw new Error(error.message);
    }

    return data as RoomClosureDTO;
};

export const updateRoomClosureApi = async (
    { id, ...payload }: RoomClosureDTO,
    blockedEntries: TimelineBlockEntry[],
) => {
    if (!id) {
        throw new Error('Closure ID is required');
    }

    if (
        hasTimelineBlockOverlap(
            blockedEntries,
            payload.room_id,
            payload.start,
            payload.end,
            id,
        )
    ) {
        throw new Error('На выбранные даты уже есть бронь или закрытие');
    }

    const { data, error } = await supabase
        .from('room_closures')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

    if (error) {
        throw new Error(error.message);
    }

    return data as RoomClosureDTO;
};

export const deleteRoomClosureApi = async (id: string) => {
    const { error } = await supabase.from('room_closures').delete().eq('id', id);

    if (error) {
        throw new Error(error.message);
    }
};

export const useCreateRoomClosure = (
    hotelId: string,
    getBlockedEntries: () => TimelineBlockEntry[],
    onSuccess?: () => void,
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (payload: RoomClosureInput) =>
            createRoomClosureApi(payload, getBlockedEntries()),
        onSuccess: async () => {
            await invalidateHotelCalendar(queryClient, hotelId);
            onSuccess?.();
        },
        onError: (error: Error) => {
            showToast(error.message || 'Не удалось закрыть даты', 'error');
        },
    });
};

export const useUpdateRoomClosure = (
    hotelId: string,
    getBlockedEntries: () => TimelineBlockEntry[],
    onSuccess?: () => void,
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (payload: RoomClosureDTO) =>
            updateRoomClosureApi(payload, getBlockedEntries()),
        onSuccess: async () => {
            await invalidateHotelCalendar(queryClient, hotelId);
            onSuccess?.();
        },
        onError: (error: Error) => {
            showToast(error.message || 'Не удалось обновить закрытие', 'error');
        },
    });
};

export const useDeleteRoomClosure = (hotelId: string, onSuccess?: () => void) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteRoomClosureApi,
        onSuccess: async () => {
            await invalidateHotelCalendar(queryClient, hotelId);
            onSuccess?.();
        },
        onError: (error: Error) => {
            showToast(error.message || 'Не удалось снять закрытие', 'error');
        },
    });
};

export const buildRoomClosureInput = (
    { room_id, date, reason, created_by, edited_by }: RoomClosureFormPayload,
    isEdit: boolean,
) => {
    const { start, end } = serializeRoomClosureDates(date);
    const trimmedReason = reason?.trim() ? reason.trim() : null;
    const actor = edited_by ?? created_by;

    if (isEdit) {
        return {
            room_id,
            start,
            end,
            reason: trimmedReason,
            edited_by: actor,
            edited_at: getDate(),
        };
    }

    return {
        room_id,
        start,
        end,
        reason: trimmedReason,
        created_by: actor,
        created_at: getDate(),
    };
};

export const getRoomClosureDefaultDates = (
    startUnix?: number,
    endUnix?: number,
): [Date, Date] => {
    const start = startUnix
        ? getDateFromUnix(startUnix).startOf('day').toDate()
        : getDateFromUnix(Math.floor(Date.now() / 1000)).startOf('day').toDate();
    const end = endUnix
        ? getDateFromUnix(endUnix).startOf('day').toDate()
        : getDateFromUnix(startUnix ?? Math.floor(Date.now() / 1000))
              .add(1, 'day')
              .startOf('day')
              .toDate();

    return [start, end];
};

export const getRoomClosureNightCount = (date: [Date, Date]) =>
    getReserveDurationDays(date[0], date[1]);
