import { TABLE_NAMES } from '@/shared/api/const';
import { HotelDTO, insertItem } from '@/shared/api/hotel/hotel';
import { RoomDTO, RoomReserves } from '@/shared/api/room/room';
import { QUERY_KEYS } from '@/shared/config/reactQuery';
import supabase from '@/shared/config/supabase';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export type ReserveDTO = {
    id: string; // Уникальный идентификатор брони
    room_id: string; // ID номера, к которому относится бронь
    start: number | Date; // Начало бронирования (Unix timestamp)
    end: number | Date; // Конец бронирования (Unix timestamp)
    title?: string; // Обязательное название брони
    prepayment?: number; // Предоплата (опционально, используется для внутренних расчетов)
    guest: string; // Имя гостя
    phone: string; // Телефон гостя
    comment?: string; // Комментарий к брони
    price: number; // Цена брони
    quantity: number; // Количество брони
    created_at?: string; // Дата создания брони Формат: "2023-10-05T12:30:00.000Z
    edited_at?: string; // Дата изменения брони Формат: "2023-10-05T12:30:00.000Z
    created_by?: string; // Кто создал бронь
    edited_by?: string; // Кто изменил бронь
};

export type TravelOption = {
    label: string;
    id: string;
};

//для формы
export type Reserve = Omit<ReserveDTO, 'id'>;
//для формы
export type ReserveForm = Omit<ReserveDTO, 'id' | 'start' | 'end' | 'room_id'> & {
    date: [Date, Date];
    hotel_id?: TravelOption; // Используется только для UI (выбор отеля и загрузка номеров), не сохраняется в резерве
    room_id: TravelOption;
};

export type Nullable<Type> = Type | null;

export type CurrentReserveType = {
    room?: Nullable<RoomDTO>;
    hotel?: Nullable<HotelDTO>;
    reserve?: Partial<ReserveDTO>;
};

export const createReserveApi = async (reserve: Reserve) => {
    try {
        await insertItem<Reserve>(TABLE_NAMES.RESERVES, reserve);
    } catch (err) {
        console.error('Error fetching posts:', err);
        throw err; // Передаем ошибку дальше для обработки в React Query
    }
};

export const deleteReserveApi = async (id: string) => {
    try {
        const { data, error } = await supabase.from('reserves').delete().eq('id', id);

        if (error) {
            throw new Error(error.message); // Преобразуем ошибку в стандартный формат
        }
        return data;
    } catch (err) {
        console.error('Error fetching posts:', err);
        throw err; // Передаем ошибку дальше для обработки в React Query
    }
};

export const updateReserveApi = async ({ id, ...reserve }: ReserveDTO) => {
    try {
        await supabase.from('reserves').update(reserve).eq('id', id);
    } catch (error) {
        console.error(error);
        showToast('Ошибка при обновлении брони', 'error');
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        throw new Error(error?.message); // Передаем ошибку дальше для обработки в React Query
    }
};

export const useCreateReserve = (
    hotelId?: string,
    roomId?: string,
    onSuccess?: () => void,
    onError?: (e: Error) => void,
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createReserveApi,
        onSuccess: async () => {
            // Инвалидируем запросы для получения актуальных данных с сервера
            await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotels });
            onSuccess?.();
        },
        onError: (err) => {
            onError?.(err as Error);
        },
    });
};

export const useUpdateReserve = (
    hotelId?: string,
    roomId?: string,
    onSuccess?: () => void,
    onError?: (e: Error) => void,
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: updateReserveApi,
        onSuccess: async () => {
            // Инвалидируем запросы для получения актуальных данных с сервера
            await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotels });
            onSuccess?.();
        },
        onError: (err) => {
            onError?.(err as Error);
        },
    });
};

export const useDeleteReserve = (
    hotelId?: string,
    roomId?: string,
    onSuccess?: () => void,
    onError?: (e: Error) => void,
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteReserveApi,
        onSuccess: async () => {
            // Инвалидируем запросы для получения актуальных данных с сервера
            await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotels });
            onSuccess?.();
        },
        onError: (err) => {
            onError?.(err as Error);
        },
    });
};

/**
 * Получение всех броней для списка отелей одним запросом
 * @param hotelIds - массив ID отелей
 * @returns Map с ключом hotel_id и значением массив RoomReserves
 */
export async function getReservesByHotels(
    hotelIds: string[],
): Promise<Map<string, RoomReserves[]>> {
    try {
        // Фильтруем пустые и невалидные UUID
        const validHotelIds = hotelIds?.filter(
            (id) => id && typeof id === 'string' && id.trim() !== '',
        );

        if (!validHotelIds || validHotelIds.length === 0) {
            return new Map();
        }

        // Получаем все номера для списка отелей с бронями
        const { data: roomsData, error } = await supabase
            .from('rooms')
            .select(
                `
                *,
                reserves(*)
            `,
            )
            .in('hotel_id', validHotelIds)
            .order('order', { ascending: true, nullsFirst: false });

        if (error) {
            throw error;
        }

        // Группируем по hotel_id
        const reservesMap = new Map<string, RoomReserves[]>();

        if (roomsData) {
            roomsData.forEach((room) => {
                const hotelId = room.hotel_id as string;
                if (!reservesMap.has(hotelId)) {
                    reservesMap.set(hotelId, []);
                }

                const roomReserves: RoomReserves = {
                    id: room.id,
                    hotel_id: room.hotel_id,
                    title: room.title,
                    price: room.price,
                    quantity: room.quantity,
                    image_title: room.image_title || '',
                    image_path: room.image_path || '',
                    comment: room.comment,
                    room_features: room.room_features || [],
                    order: room.order || 0,
                    reserves: (room.reserves || []) as ReserveDTO[],
                };

                reservesMap.get(hotelId)!.push(roomReserves);
            });
        }

        return reservesMap;
    } catch (error) {
        console.error('Ошибка при получении броней для отелей:', error);
        throw error;
    }
}
