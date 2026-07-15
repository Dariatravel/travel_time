import { TABLE_NAMES } from '@/shared/api/const';
import {
    parseReserveHistoryChanges,
    type ReserveHistoryAction,
    type ReserveHistoryEntry,
} from '@/features/ReserveInfo/lib/formatReserveHistory';
import { HotelDTO } from '@/shared/api/hotel/hotel';
import { RoomDTO, RoomReserves } from '@/shared/api/room/room';
import { QUERY_KEYS } from '@/shared/config/reactQuery';
import supabase from '@/shared/config/supabase';
import { getDate } from '@/shared/lib/getDate';
import {
    hasReserveNightOverlap,
    toReserveUnix,
} from '@/shared/lib/reserveOverlap';
import {
    createReserveViaYandexBackend,
    isProxyUnavailableError,
    isYandexBackendProxyClientEnabled,
    updateReserveViaYandexBackend,
} from '@/shared/api/yandexBackendProxy';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type ReserveDTO = {
    id: string; // Уникальный идентификатор брони
    room_id: string; // ID номера, к которому относится бронь
    start: number | Date; // Начало бронирования (Unix timestamp)
    end: number | Date; // Конец бронирования (Unix timestamp)
    title?: string; // Обязательное название брони
    // Предоплата. В базе колонка text, поэтому из Supabase приходит строкой,
    // формы дают число — для расчётов приводить через parsePrepayment().
    prepayment?: number | string | null;
    guest: string; // Имя гостя
    phone: string; // Телефон гостя
    comment?: string; // Комментарий к брони
    price: number; // Цена брони
    quantity: number; // Количество брони
    created_at?: string; // Дата создания брони Формат: "2023-10-05T12:30:00.000Z
    edited_at?: string; // Дата изменения брони Формат: "2023-10-05T12:30:00.000Z
    created_by?: string; // Кто создал бронь
    edited_by?: string; // Кто изменил бронь
    external_source?: string | null; // Внешний источник синхронизации
    external_uid?: string | null; // ID события во внешнем источнике
    external_feed_url?: string | null; // URL iCalendar-фида
    external_synced_at?: string | null; // Дата последней синхронизации
    is_fixed?: boolean; // Бронь нельзя автоматически или вручную перемещать
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

export type ReserveOverlap = Pick<ReserveDTO, 'id' | 'start' | 'end' | 'guest' | 'phone'> & {
    rooms?: {
        title?: string | null;
        hotels?: {
            title?: string | null;
        } | null;
    } | null;
};

export type DeletedReserveItem = {
    id: string;
    reserve_id: string;
    deleted_at: string;
    deleted_by?: string | null;
    reserve_data: ReserveDTO;
    room_data?: Partial<RoomDTO> | null;
    hotel_data?: Partial<HotelDTO> | null;
    restored_at?: string | null;
    restored_by?: string | null;
    restored_reserve_id?: string | null;
};

export async function getReserveHistory(reserveId: string): Promise<ReserveHistoryEntry[]> {
    const { data, error } = await supabase
        .from('reserve_history')
        .select('id, reserve_id, action, changed_by, changed_at, changes')
        .eq('reserve_id', reserveId)
        .order('changed_at', { ascending: false });

    if (error) {
        throw new Error(error.message);
    }

    return (data ?? []).map((row) => ({
        id: row.id,
        reserve_id: row.reserve_id,
        action: row.action as ReserveHistoryAction,
        changed_by: row.changed_by,
        changed_at: row.changed_at,
        changes: parseReserveHistoryChanges(row.changes),
    }));
}

export const useReserveHistory = (reserveId?: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: reserveId
            ? QUERY_KEYS.reserveHistory(reserveId)
            : [...QUERY_KEYS.reserveHistoryPrefix, 'none'],
        queryFn: () => {
            if (!reserveId) {
                throw new Error('Reserve ID is required');
            }
            return getReserveHistory(reserveId);
        },
        enabled: enabled && !!reserveId,
    });
};

const invalidateReserveHistory = async (
    queryClient: ReturnType<typeof useQueryClient>,
    reserveId?: string,
) => {
    if (!reserveId) return;
    await queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.reserveHistory(reserveId),
    });
};

const toReserveInsertPayload = (reserve: Reserve) => {
    const prepayment =
        reserve.prepayment == null ? null : String(reserve.prepayment);

    return {
        room_id: reserve.room_id,
        start: reserve.start,
        end: reserve.end,
        guest: reserve.guest,
        phone: reserve.phone,
        price: reserve.price,
        quantity: reserve.quantity,
        prepayment,
        comment: reserve.comment ?? '',
        created_at: reserve.created_at,
        created_by: reserve.created_by,
        edited_at: reserve.edited_at,
        edited_by: reserve.edited_by,
        is_fixed: reserve.is_fixed ?? false,
    };
};

const toReserveUpdatePayload = (reserve: Omit<ReserveDTO, 'id'>) =>
    toReserveInsertPayload(reserve);

const formatOverlapDate = (value: ReserveDTO['start']) =>
    new Date(toReserveUnix(value) * 1000).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

const assertNoReserveOverlap = async (
    reserve: Pick<ReserveDTO, 'room_id' | 'start' | 'end'>,
    excludeReserveId?: string,
) => {
    if (!reserve.room_id) {
        return;
    }

    let query = supabase
        .from('reserves')
        .select('id, start, end, guest')
        .eq('room_id', reserve.room_id)
        .lt('start', toReserveUnix(reserve.end))
        .gt('end', toReserveUnix(reserve.start));

    if (excludeReserveId) {
        query = query.neq('id', excludeReserveId);
    }

    const { data, error } = await query.order('start', { ascending: true }).limit(8);

    if (error) {
        throw new Error(error.message);
    }

    const overlaps = (data ?? []).filter((item) => hasReserveNightOverlap(item, reserve));

    if (overlaps.length === 0) {
        return;
    }

    const conflictMessage = overlaps
        .map(
            (item) =>
                `${item.guest || 'Без имени'}: ${formatOverlapDate(item.start)} - ${formatOverlapDate(item.end)}`,
        )
        .join('; ');

    throw new Error(`Наложение броней запрещено. Конфликт: ${conflictMessage}`);
};

export const createReserveApi = async (reserve: Reserve) => {
    try {
        if (isYandexBackendProxyClientEnabled()) {
            try {
                const response = await createReserveViaYandexBackend(reserve);
                return response.data;
            } catch (error) {
                // Фолбэк в Supabase запрещён: при ошибке сети или 5xx бронь могла
                // уже создаться на сервере — повторная вставка даёт дубль.
                if (!isProxyUnavailableError(error)) {
                    throw error;
                }
                console.warn(
                    'Yandex backend proxy is unavailable (404), falling back to Supabase',
                    error,
                );
            }
        }

        await assertNoReserveOverlap(reserve);

        const { data, error } = await supabase
            .from(TABLE_NAMES.RESERVES)
            .insert(toReserveInsertPayload(reserve))
            .select('*')
            .single();

        if (error) {
            throw new Error(error.message);
        }

        return data as ReserveDTO;
    } catch (err) {
        console.error('Error creating reserve:', err);
        showToast('Ошибка при создании брони', 'error');
        throw err;
    }
};

export const deleteReserveApi = async (id: string) => {
    try {
        const { data: reserveSnapshot, error: snapshotError } = await supabase
            .from('reserves')
            .select(
                `
                *,
                rooms (
                    *,
                    hotels (*)
                )
            `,
            )
            .eq('id', id)
            .single();

        if (snapshotError) {
            throw new Error(snapshotError.message);
        }

        if (reserveSnapshot) {
            const room = Array.isArray(reserveSnapshot.rooms)
                ? reserveSnapshot.rooms[0]
                : reserveSnapshot.rooms;
            const hotel = Array.isArray(room?.hotels) ? room.hotels[0] : room?.hotels;
            const reserveData = Object.fromEntries(
                Object.entries(reserveSnapshot).filter(([key]) => key !== 'rooms'),
            );

            const { error: backupError } = await supabase.from('reserve_deleted_items').insert({
                reserve_id: id,
                deleted_by: reserveData.edited_by ?? reserveData.created_by ?? null,
                reserve_data: reserveData,
                room_data: room ? { ...room, hotels: undefined } : null,
                hotel_data: hotel ?? null,
            });

            if (backupError) {
                // Бэкап удаляемой брони обязателен: без него удаление означало бы
                // безвозвратную потерю данных. Прерываем удаление — бронь остаётся,
                // менеджер видит ошибку и может повторить.
                throw new Error(
                    `Не удалось сохранить резервную копию брони — удаление отменено: ${backupError.message}`,
                );
            }
        }

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

export const getDeletedReserves = async (): Promise<DeletedReserveItem[]> => {
    const { data, error } = await supabase
        .from('reserve_deleted_items')
        .select('*')
        .is('restored_at', null)
        .order('deleted_at', { ascending: false })
        .limit(30);

    if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return [];
        throw new Error(error.message);
    }

    return (data ?? []) as DeletedReserveItem[];
};

export const restoreDeletedReserveApi = async ({
    deletedItemId,
    restoredBy,
    allowOverlap = false,
}: {
    deletedItemId: string;
    restoredBy?: string;
    allowOverlap?: boolean;
}) => {
    const { data: deletedItem, error: selectError } = await supabase
        .from('reserve_deleted_items')
        .select('*')
        .eq('id', deletedItemId)
        .is('restored_at', null)
        .single();

    if (selectError) {
        throw new Error(selectError.message);
    }

    const item = deletedItem as DeletedReserveItem;
    const overlaps = await getReserveOverlaps({
        roomId: item.reserve_data.room_id,
        start: Number(item.reserve_data.start),
        end: Number(item.reserve_data.end),
    });

    if (overlaps.length > 0 && !allowOverlap) {
        throw new Error('Есть пересечение с активной бронью. Подтвердите восстановление вручную.');
    }

    const reservePayload = {
        ...item.reserve_data,
        edited_by: restoredBy ?? item.reserve_data.edited_by,
        edited_at: getDate(),
    };

    const { data: restoredReserve, error: insertError } = await supabase
        .from('reserves')
        .insert(reservePayload)
        .select('id')
        .single();

    if (insertError) {
        throw new Error(insertError.message);
    }

    const { error: updateError } = await supabase
        .from('reserve_deleted_items')
        .update({
            restored_at: getDate(),
            restored_by: restoredBy ?? null,
            restored_reserve_id: restoredReserve.id,
        })
        .eq('id', deletedItemId);

    if (updateError) {
        throw new Error(updateError.message);
    }

    return restoredReserve;
};

export const getReserveOverlaps = async ({
    roomId,
    start,
    end,
    excludeReserveId,
}: {
    roomId: string;
    start: number;
    end: number;
    excludeReserveId?: string;
}) => {
    let query = supabase
        .from('reserves')
        .select(
            `
            id,
            start,
            end,
            guest,
            phone,
            rooms (
                title,
                hotels (
                    title
                )
            )
        `,
        )
        .eq('room_id', roomId)
        .lt('start', end)
        .gt('end', start);

    if (excludeReserveId) {
        query = query.neq('id', excludeReserveId);
    }

    const { data, error } = await query.order('start', { ascending: true }).limit(8);

    if (error) {
        throw new Error(error.message);
    }

    return (data ?? []).filter((item) =>
        hasReserveNightOverlap(item, { start, end }),
    ) as unknown as ReserveOverlap[];
};

export const updateReserveApi = async ({ id, ...reserve }: ReserveDTO) => {
    try {
        if (!id) {
            throw new Error('Reserve ID is required');
        }

        await assertNoReserveOverlap(reserve, id);

        if (isYandexBackendProxyClientEnabled()) {
            try {
                return await updateReserveViaYandexBackend({ id, ...reserve });
            } catch (error) {
                // Фолбэк в Supabase запрещён: обновление могло уже примениться
                // на сервере, а ошибка 409/сети не повод писать напрямую.
                if (!isProxyUnavailableError(error)) {
                    throw error;
                }
                console.warn(
                    'Yandex backend proxy is unavailable (404), falling back to Supabase',
                    error,
                );
            }
        }

        const { data, error } = await supabase
            .from('reserves')
            .update(toReserveUpdatePayload(reserve))
            .eq('id', id)
            .select('id')
            .single();

        if (error) {
            throw new Error(error.message);
        }

        return data;
    } catch (error) {
        console.error(error);
        showToast('Ошибка при обновлении брони', 'error');
        throw error; // Передаем ошибку дальше для обработки в React Query
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
            // Точечная инвалидация: обновляем только конкретный отель
            if (hotelId) {
                await Promise.all([
                    queryClient.invalidateQueries({
                        queryKey: QUERY_KEYS.hotelDetail(hotelId),
                    }),
                    queryClient.invalidateQueries({
                        queryKey: QUERY_KEYS.hotelById(hotelId),
                    }),
                    queryClient.invalidateQueries({
                        queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotelId],
                    }),
                ]);
            }
            await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.recentActivity });
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
        onSuccess: async (_data, variables) => {
            // Точечная инвалидация: обновляем только конкретный отель
            if (hotelId) {
                await Promise.all([
                    queryClient.invalidateQueries({
                        queryKey: QUERY_KEYS.hotelDetail(hotelId),
                    }),
                    queryClient.invalidateQueries({
                        queryKey: QUERY_KEYS.hotelById(hotelId),
                    }),
                    queryClient.invalidateQueries({
                        queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotelId],
                    }),
                ]);
            }
            await invalidateReserveHistory(queryClient, variables.id);
            await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.recentActivity });
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
        onSuccess: async (_data, reserveId) => {
            // Точечная инвалидация: обновляем только конкретный отель
            if (hotelId) {
                await Promise.all([
                    queryClient.invalidateQueries({
                        queryKey: QUERY_KEYS.hotelDetail(hotelId),
                    }),
                    queryClient.invalidateQueries({
                        queryKey: QUERY_KEYS.hotelById(hotelId),
                    }),
                    queryClient.invalidateQueries({
                        queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotelId],
                    }),
                ]);
            }
            await invalidateReserveHistory(queryClient, reserveId);
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
    allowedRoomsByHotel?: Map<string, string[]>, // Карта hotel_id -> array of allowed room_ids
): Promise<Map<string, RoomReserves[]>> {
    try {
        // Фильтруем пустые и невалидные UUID
        const validHotelIds = hotelIds?.filter(
            (id) => id && typeof id === 'string' && id.trim() !== '',
        );

        if (!validHotelIds || validHotelIds.length === 0) {
            return new Map();
        }

        // Если есть фильтр по номерам, собираем все разрешённые room_ids
        let allowedRoomIds: string[] | undefined;
        if (allowedRoomsByHotel && allowedRoomsByHotel.size > 0) {
            allowedRoomIds = [];
            validHotelIds.forEach((hotelId) => {
                const hotelRooms = allowedRoomsByHotel.get(hotelId) || [];
                allowedRoomIds!.push(...hotelRooms);
            });
        }

        if (allowedRoomIds && allowedRoomIds.length === 0) {
            return new Map();
        }

        // Получаем номера для списка отелей с бронями
        const query = supabase
            .from('rooms')
            .select(
                `
                *,
                reserves(*)
            `,
            )
            .in('hotel_id', validHotelIds);

        // Если есть фильтр по конкретным номерам, применяем его
        if (allowedRoomIds && allowedRoomIds.length > 0) {
            query.in('id', allowedRoomIds);
        }

        query.order('order', { ascending: true, nullsFirst: false });

        const { data: roomsData, error } = await query;

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
                    ...room,
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
