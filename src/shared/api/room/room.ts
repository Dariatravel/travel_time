import { TABLE_NAMES } from '@/shared/api/const';
import { insertItem } from '@/shared/api/hotel/hotel';
import { ReserveDTO } from '@/shared/api/reserve/reserve';
import { QUERY_KEYS } from '@/shared/config/reactQuery';
import supabase from '@/shared/config/supabase';
import { TravelFilterType } from '@/shared/models/hotels';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type RoomDTO = {
    id: string; // Уникальный идентификатор номера
    hotel_id: string;
    title: string; // Название номера
    price: number; // Цена за ночь
    quantity: number; // Вместимость
    image_title: string; // Название изображения
    image_path: string; // Путь к изображению
    comment?: string; // Комментарий к номеру
    order?: number;
};

export type RoomReserves = {
    id: string; // Уникальный идентификатор номера
    hotel_id: string;
    title: string; // Название номера
    price: number; // Цена за ночь
    quantity: number; // Количество номеров данного типа
    image_title: string; // Название изображения
    image_path: string; // Путь к изображению
    comment?: string; // Комментарий к номеру
    order?: number; // Порядок отображения
    reserves: ReserveDTO[]; // Список бронирований для этого номера
};
export type Room = Omit<RoomDTO, 'id'>;

export async function getRoomsByHotel(hotel_id?: string) {
    const response = await supabase
        .from(TABLE_NAMES.ROOMS)
        .select()
        .filter('hotel_id', 'eq', hotel_id);
    return response.data as RoomDTO[]; // Возвращаем массив отелей
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
    try {
        await supabase.from('rooms').update(room).eq('id', id);
    } catch (error) {
        console.error(error);
        showToast(`Ошибка при обновлении брони ${error}`, 'error');
    }
};

export const deleteRoomApi = async (id: string) => {
    try {
        await supabase.from('rooms').delete().eq('id', id);
    } catch (err) {
        console.error('Error fetching posts:', err);
        showToast(`Ошибка при обновлении брони ${err}`, 'error');
    }
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
        onSuccess: (data, variables) => {
            // Инвалидируем кеш для обновления данных
            queryClient.invalidateQueries({
                queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, variables.hotelId],
            });
            queryClient.invalidateQueries({
                queryKey: [...QUERY_KEYS.roomsByHotel, variables.hotelId],
            });

            onSuccess?.();
        },
        onError: (error: Error) => {
            onError?.(error.message);
        },
    });
};

export const useGetRoomsByHotel = (hotel_id?: string, enabled?: boolean) => {
    return useQuery({
        queryKey: QUERY_KEYS.roomsByHotel,
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
export const useCreateRoom = (onSuccess: () => void, onError?: (e: Error) => void) => {
    return useMutation({
        mutationFn: createRoomApi,
        onSuccess,
        onError,
    });
};

export const useUpdateRoom = (onSuccess?: () => void, onError?: (e: Error) => void) => {
    return useMutation({
        mutationFn: updateRoomApi,
        onSuccess,
        onError,
    });
};

export const useDeleteRoom = (onSuccess?: () => void, onError?: (e: Error) => void) => {
    return useMutation({
        mutationFn: deleteRoomApi,
        onSuccess,
        onError,
    });
};
