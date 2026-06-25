import { TABLE_NAMES } from '@/shared/api/const';
import { insertItem } from '@/shared/api/hotel/hotel';
import { ReserveDTO } from '@/shared/api/reserve/reserve';
import { QUERY_KEYS, invalidateHotelChessmateQueries } from '@/shared/config/reactQuery';
import supabase from '@/shared/config/supabase';
import { TravelFilterType } from '@/shared/models/hotels';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type RoomDTO = {
    id: string; // Уникальный идентификатор номера
    hotel_id: string;
    title: string; // Название номера
    // Тип номера (например, апартаменты, стандарт, студия).
    // Ранее тип задавался на уровне отеля, теперь он перенесён на уровень номера.
    type?: string;
    price: number; // Цена за ночь
    quantity: number; // Вместимость
    image_title: string; // Название изображения
    image_path: string; // Путь к изображению
    comment?: string; // Комментарий к номеру
    room_features?: string[]; // Особенности номера
    order?: number;
};

export type RoomReserves = {
    id: string; // Уникальный идентификатор номера
    hotel_id: string;
    title: string; // Название номера
    // Тип номера (например, апартаменты, стандарт, студия).
    type?: string;
    price: number; // Цена за ночь
    quantity: number; // Количество номеров данного типа
    image_title: string; // Название изображения
    image_path: string; // Путь к изображению
    comment?: string; // Комментарий к номеру
    room_features?: string[]; // Особенности номера
    order?: number; // Порядок отображения
    reserves: ReserveDTO[]; // Список бронирований для этого номера
};
export type Room = Omit<RoomDTO, 'id'>;

export async function getRoomsByHotel(hotel_id?: string) {
    if (!hotel_id) {
        return [];
    }

    const { data, error } = await supabase
        .from(TABLE_NAMES.ROOMS)
        .select()
        .filter('hotel_id', 'eq', hotel_id);

    if (error) {
        throw new Error(error.message);
    }

    return data as RoomDTO[]; // Возвращаем массив номеров
}

export async function getRoomsWithReservesByHotel(
    hotel_id?: string,
    filter?: TravelFilterType,
    withReserves?: boolean,
) {
    const query = supabase.from(TABLE_NAMES.ROOMS).select(`*`);

    if (withReserves) {
        query.select(`
      *,
      reserves(*)`);
    }

    query.filter('hotel_id', 'eq', hotel_id);

    if (filter?.freeHotels && hotel_id) {
        const allowedRooms = filter?.freeHotels.get(hotel_id) ?? [];

        query.in('id', allowedRooms);
    }

    // Фильтрация по особенностям номера (room_features)
    if (filter?.roomFeatures && filter.roomFeatures.length > 0) {
        // Используем overlaps для проверки пересечения массивов
        query.overlaps('room_features', filter.roomFeatures);
    }

    query.order('order', { ascending: true, nullsFirst: false });
    const response = await query;

    return response.data as unknown as RoomReserves[]; // Возвращаем массив отелей
}

export const createRoomApi = async (room: Room) => {
    try {
        const { responseData } = await insertItem<Room>(TABLE_NAMES.ROOMS, room);
        return responseData;
    } catch (error) {
        throw error;
    }
};

export const updateRoomApi = async ({ id, ...room }: RoomDTO) => {
    if (!id) {
        throw new Error('Room ID is required');
    }

    const updatePayload = {
        hotel_id: room.hotel_id,
        title: room.title,
        type: room.type,
        price: room.price,
        quantity: room.quantity,
        comment: room.comment,
        room_features: room.room_features,
    };

    const { data, error } = await supabase
        .from('rooms')
        .update(updatePayload)
        .eq('id', id)
        .select('id')
        .single();

    if (error) {
        throw new Error(error.message);
    }

    return data;
};

export const deleteRoomApi = async (id: string) => {
    const { data, error } = await supabase.from('rooms').delete().eq('id', id).select('id').single();

    if (error) {
        throw new Error(error.message);
    }

    return data;
};

/**
 * Обновляет порядок номеров в отеле
 * @param hotelId - ID отеля
 * @param rooms - массив полных объектов RoomDTO с актуальным order
 * @returns Promise с результатом обновления
 */
export const updateRoomOrder = async (hotelId: string, rooms: RoomDTO[]) => {
    // Теперь сброс order не требуется, так как upsert обновляет все поля
    const { data, error } = await supabase.from('rooms').upsert(rooms, { onConflict: 'id' });

    if (error) {
        throw new Error(`Ошибка при обновлении порядка номеров: ${error.message}`);
    }

    return data;
};

/**
 * Хук для обновления порядка номеров
 * @param onSuccess - колбэк при успешном обновлении
 * @param onError - колбэк при ошибке
 * @returns объект с состоянием мутации
 */
export const useUpdateRoomOrder = (onSuccess?: () => void, onError?: (error: string) => void) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ hotelId, rooms }: { hotelId: string; rooms: RoomDTO[] }) =>
            updateRoomOrder(hotelId, rooms),
        onSuccess: async (_data, variables) => {
            await invalidateHotelChessmateQueries(queryClient, variables.hotelId);
            onSuccess?.();
        },
        onError: (error: Error) => {
            onError?.(error.message);
        },
    });
};

export const useGetRoomsByHotel = (hotel_id?: string, enabled?: boolean) => {
    return useQuery({
        queryKey: [...QUERY_KEYS.roomsByHotel, hotel_id],
        queryFn: () => getRoomsByHotel(hotel_id),
        enabled,
    });
};

export const useGetRoomsWithReservesByHotel = (
    hotel_id?: string,
    filter?: TravelFilterType,
    withReserves?: boolean,
) => {
    return useQuery({
        queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel_id],
        queryFn: () => getRoomsWithReservesByHotel(hotel_id, filter, withReserves),
    });
};
export const useCreateRoom = (
    hotelId?: string,
    onSuccess?: () => void,
    onError?: (e: Error) => void,
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: createRoomApi,
        onSuccess: async (_data, variables) => {
            const id = hotelId || variables.hotel_id;
            if (id) {
                await invalidateHotelChessmateQueries(queryClient, id);
            }
            onSuccess?.();
        },
        onError: (err) => {
            showToast(`Ошибка при добавлении номера: ${(err as Error).message}`, 'error');
            onError?.(err as Error);
        },
    });
};

export const useUpdateRoom = (
    hotelId?: string,
    onSuccess?: () => void,
    onError?: (e: Error) => void,
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: updateRoomApi,
        onSuccess: async (_data, variables) => {
            const id = hotelId || variables.hotel_id;
            if (id) {
                await invalidateHotelChessmateQueries(queryClient, id);
            }
            onSuccess?.();
        },
        onError: (err) => {
            showToast(`Ошибка при обновлении номера: ${(err as Error).message}`, 'error');
            onError?.(err as Error);
        },
    });
};

export const useDeleteRoom = (
    hotelId?: string,
    onSuccess?: () => void,
    onError?: (e: Error) => void,
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: deleteRoomApi,
        onSuccess: async (_data, variables) => {
            const id = hotelId || (typeof variables === 'string' ? variables : undefined);
            if (id) {
                await invalidateHotelChessmateQueries(queryClient, id);
            }
            onSuccess?.();
        },
        onError: (err) => {
            showToast(`Ошибка при удалении номера: ${(err as Error).message}`, 'error');
            onError?.(err as Error);
        },
    });
};
