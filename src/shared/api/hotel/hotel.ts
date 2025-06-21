import { TABLE_NAMES } from '@/shared/api/const';
import { ReserveDTO, TravelOption } from '@/shared/api/reserve/reserve';
import { Room, RoomDTO } from '@/shared/api/room/room';
import { QUERY_KEYS } from '@/shared/config/reactQuery';
import supabase from '@/shared/config/supabase';
import { TravelFilterType } from '@/shared/models/hotels';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { RoomReserves } from './../room/room';

// Тип Room
export interface HotelImage {
    id: string;
    file: File;
}

export interface Hotel {
    id: string;
    title: string;
    type: string;
    rating: number;
    address: string;
    phone: string;
    user_id: string;
    telegram_url?: string;
    description: string;
    image_id?: string;
}

export interface HotelDTO extends Hotel {
    image_id?: string;
}

export type HotelRoomsDTO = HotelDTO & { rooms: RoomDTO[] };

export type HotelRoomsReservesDTO = HotelDTO & { rooms: RoomReserves[] };
//для создания отеля
export interface CreateHotelDTO extends Omit<Hotel, 'id'> {
    image_id?: string;
}

//для формы
export type RoomForm = Omit<Room, 'hotel_id' | 'price'> & {
    hotel_id: TravelOption;
    price: string;
};

export interface FreeHotelsDTO {
    free_room_count: number;
    hotel_id: string;
    hotel_title: string;
    rooms: {
        room_id: string;
        room_price: number;
        room_title: string;
        reserves: ReserveDTO[];
    }[];
}

//для формы Room и Reserve
export type HotelForRoom = Pick<HotelDTO, 'id' | 'title'>;

export type HotelWithRoomsCount = HotelDTO & { rooms: { count: number }[] };

/**
 * Получение отелей с комнатами из view hotels_with_rooms с поддержкой пагинации и фильтрации
 * @param filter - фильтр для поиска
 * @param page - номер страницы (начиная с 0)
 * @param limit - количество элементов на странице
 * @returns объект с массивом отелей и общим количеством
 */
export async function getAllHotels(filter?: TravelFilterType, page: number = 0, limit: number = 10): Promise<{ data: HotelRoomsDTO[]; count: number }> {
    try {
        const from = page * limit;
        const to = from + limit - 1;

        let query = supabase.from('hotels_with_rooms').select('*, rooms(*)', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);

        if (filter?.type) {
            query = query.eq('type', filter.type);
        }

        // if (filter?.hotels_id) {
        //     query = query.in('id', filter.hotels_id);
        // }

        // фильтрация по количеству необходима для того, чтобы исключить ситуацию, когда мы получаем отель, в котором нет номеров, тогда на UI мы ничего не увидим
        if (filter?.quantity) {
            query = query.gte('rooms.quantity', filter.quantity);
        }

        const response = await query;

        console.log({ response });
        return {
            data: response.data as HotelRoomsDTO[],
            count: response.count || 0,
        };
    } catch (error) {
        console.error('Ошибка при получении отелей:', error);
        throw error;
    }
}

/**
 * Хук для бесконечной подгрузки отелей с поддержкой фильтрации
 * @param filter - фильтр для поиска
 * @param limit - количество элементов на странице (по умолчанию 5)
 */
export const useInfiniteHotelsQuery = (filter?: TravelFilterType, limit: number = 5) => {
    return useInfiniteQuery({
        queryKey: [QUERY_KEYS.hotels, filter],
        queryFn: async ({ pageParam = 0 }) => {
            const result = await getAllHotels(filter, pageParam as number, limit);
            return result; // Возвращаем полный объект с data и count
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage: { data: HotelRoomsDTO[]; count: number }, allPages: { data: HotelRoomsDTO[]; count: number }[]) => {
            const totalLoaded = allPages.reduce((sum, page) => sum + page.data.length, 0);
            return totalLoaded < lastPage.count ? allPages.length : undefined;
        },
    });
};

export async function getAllHotelsForRoom(): Promise<HotelForRoom[]> {
    const response = await supabase.from('hotels').select('id, title');
    return response.data as HotelForRoom[]; // Возвращаем массив отелей
}

export async function getAllCounts() {
    const { data, error } = await supabase.rpc('get_hotel_room_reserve_counts');

    if (error) throw error;

    return data as {
        hotel_count: number;
        room_count: number;
        reserve_count: number;
    }[]; // Возвращаем массив отелей
}

export async function insertItem<Type>(
    tableName: string,
    data: Type,
    options?: {
        count?: 'exact' | 'planned' | 'estimated';
    },
) {
    try {
        const { data: responseData, error } = await supabase.from(tableName).insert(data, options);
        return { responseData, error };
    } catch (error) {
        console.error('im here', error);

        throw error;
    }
}

export const getHotelById = async (id: string) => {
    try {
        const response = await supabase.from('hotels').select('*, rooms(*)').eq('id', id).single();

        return response?.data;
    } catch (e) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        throw new Error(e);
    }
};

export const useHotelById = (id: string) => {
    return useQuery({
        queryKey: QUERY_KEYS.hotelById,
        queryFn: () => getHotelById(id),
    });
};

export const useGetAllHotels = (enabled?: boolean, filter?: TravelFilterType, select?: (hotels: HotelRoomsDTO[]) => HotelRoomsDTO[]) => {
    return useQuery({
        queryKey: [QUERY_KEYS.hotels, filter],
        queryFn: async () => {
            const result = await getAllHotels(filter);
            return result.data;
        },
        enabled: enabled,
        select: select,
    });
};

export const useGetAllCounts = () => {
    return useQuery({
        queryKey: QUERY_KEYS.allCounts,
        queryFn: getAllCounts,
    });
};
export const useGetHotelsForRoom = () => {
    return useQuery({
        queryKey: QUERY_KEYS.hotelsForRoom,
        queryFn: getAllHotelsForRoom,
    });
};

export async function getHotelsWithFreeRooms(start_time: number, end_time: number): Promise<FreeHotelsDTO[]> {
    try {
        const { data, error } = await supabase.rpc('get_hotels_with_free_rooms_in_period', {
            start_time,
            end_time,
        });

        return data ?? ([] as FreeHotelsDTO[]);
    } catch (error) {
        console.error(
            'Ошибка при получении отелей с свободными номерами:',
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            error?.message,
        );
        throw error;
    }
}

export const createHotelApi = async (hotel: Hotel) => {
    try {
        await insertItem<Hotel>(TABLE_NAMES.HOTELS, hotel);
    } catch (error) {
        console.error(error);
        showToast(`Ошибка при обновлении брони ${error}`, 'error');
    }
};

export const updateHotelApi = async ({ id, ...hotel }: HotelDTO) => {
    try {
        await supabase.from('hotels').update(hotel).eq('id', id);
    } catch (error) {
        console.error(error);
        showToast(`Ошибка при обновлении брони ${error}`, 'error');
    }
};

export const deleteHotelApi = async (id: string) => {
    try {
        await supabase.from('hotels').delete().eq('id', id);
    } catch (err) {
        console.error('Error fetching posts:', err);
        showToast(`Ошибка при обновлении брони ${err}`, 'error');
    }
};

export const useCreateHotel = (onSuccess: () => void, onError?: (e: Error) => void) => {
    return useMutation({
        mutationFn: (hotel: Hotel) => {
            return createHotelApi(hotel);
        },
        onSuccess,
        onError,
    });
};

export const useUpdateHotel = (onSuccess?: () => void, onError?: (e: Error) => void) => {
    return useMutation({
        mutationFn: updateHotelApi,
        onSuccess,
        onError,
    });
};

export const useDeleteHotel = (onSuccess?: () => void, onError?: (e: Error) => void) => {
    return useMutation({
        mutationFn: deleteHotelApi,
        onSuccess,
        onError,
    });
};

export const createImageApi = async (fileName: string, file: File) => {
    try {
        const { data, error } = await supabase.storage
            .from('images') // Замените на имя вашего bucket
            .upload(fileName, file);
    } catch (err) {
        console.error('Error fetching posts:', err);
        showToast(`Ошибка при обновлении брони ${err}`, 'error');
    }
};
export const useCreateImage = (onSuccess?: () => void, onError?: (e: Error) => void) => {
    return useMutation({
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        mutationFn: (fileName: string, file: File) => createImageApi(fileName, file),
        onSuccess,
        onError,
    });
};



