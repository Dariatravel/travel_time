import { TABLE_NAMES } from '@/shared/api/const';
import { insertItem } from '@/shared/api/hotel/hotel';
import { ReserveDTO } from '@/shared/api/reserve/reserve';
import { QUERY_KEYS } from '@/shared/config/reactQuery';
import supabase from '@/shared/config/supabase';
import { TravelFilterType } from '@/shared/models/hotels';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useMutation, useQuery } from '@tanstack/react-query';

export type RoomDTO = {
    id: string; // Уникальный идентификатор номера
    hotel_id: string;
    title: string; // Название номера
    price: number; // Цена за ночь
    quantity: number; // Вместимость
    image_title: string; // Название изображения
    image_path: string; // Путь к изображению
    comment?: string; // Комментарий к номеру
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
    reserves: ReserveDTO[]; // Список бронирований для этого номера
};
export type Room = Omit<RoomDTO, 'id'>;

export async function getRoomsByHotel(hotel_id?: string) {
    const response = await supabase.from(TABLE_NAMES.ROOMS).select().filter('hotel_id', 'eq', hotel_id);
    return response.data as RoomDTO[]; // Возвращаем массив отелей
}

export async function getRoomsWithReservesByHotel(hotel_id?: string, filter?: TravelFilterType, withReserves?: boolean) {
    const query = supabase.from(TABLE_NAMES.ROOMS).select(`*`);

    if (withReserves) {
        query.select(`
      id,
      title,
      quantity,
      reserves(*)`);
    }

    query.filter('hotel_id', 'eq', hotel_id);

    if (filter?.hotels && hotel_id) {
        const allowedRooms = filter?.hotels.get(hotel_id) ?? [];

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

export const useGetRoomsByHotel = (hotel_id?: string, enabled?: boolean) => {
    return useQuery({
        queryKey: QUERY_KEYS.roomsByHotel,
        queryFn: () => getRoomsByHotel(hotel_id),
        enabled,
    });
};

export const useGetRoomsWithReservesByHotel = (hotel_id?: string, filter?: TravelFilterType, withReserves?: boolean) => {
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
