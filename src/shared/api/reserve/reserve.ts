import { TABLE_NAMES } from '@/shared/api/const';
import { HotelDTO, insertItem } from '@/shared/api/hotel/hotel';
import { RoomDTO } from '@/shared/api/room/room';
import supabase from '@/shared/config/supabase';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useMutation } from '@tanstack/react-query';

export type ReserveDTO = {
    id: string; // Уникальный идентификатор брони
    room_id: string; // ID номера, к которому относится бронь
    start: number; // Начало бронирования (Unix timestamp)
    end: number; // Конец бронирования (Unix timestamp)
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
    hotel_id: TravelOption;
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

export const useCreateReserve = (onSuccess?: () => void, onError?: (e: Error) => void) => {
    return useMutation({
        mutationFn: createReserveApi,
        onSuccess,
        onError,
    });
};

export const useUpdateReserve = (onSuccess?: () => void, onError?: (e: Error) => void) => {
    return useMutation({
        mutationFn: updateReserveApi,
        onSuccess,
        onError,
    });
};

export const useDeleteReserve = (onSuccess?: () => void, onError?: (e: Error) => void) => {
    return useMutation({
        mutationFn: deleteReserveApi,
        onSuccess,
        onError,
    });
};
