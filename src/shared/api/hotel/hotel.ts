import { TABLE_NAMES } from '@/shared/api/const';
import { ReserveDTO, TravelOption, getReservesByHotels } from '@/shared/api/reserve/reserve';
import { Room, RoomDTO, RoomReserves } from '@/shared/api/room/room';
import { QUERY_KEYS, invalidateHotelChessmateQueries } from '@/shared/config/reactQuery';
import supabase from '@/shared/config/supabase';
import { TravelFilterType } from '@/shared/models/hotels';
import {
    getChessmateHotelHeaderStatus,
    sortByChessmateHotelHeaderStatus,
} from '@/features/Reservation/lib/chessmateHotelHeaderStatus';
import {
    getHotelCalendarViaYandexBackend,
    isYandexBackendProxyClientEnabled,
} from '@/shared/api/yandexBackendProxy';
import { showToast } from '@/shared/ui/Toast/Toast';
import {
    keepPreviousData,
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';

// Тип Room
export interface HotelImage {
    id: string;
    file: File;
}

export interface Hotel extends HotelFeatures {
    id: string;
    title: string;
    // Тип больше не используется на уровне отеля.
    // Он перенесён на уровень номера (room.type), чтобы тип относился к конкретному номеру.
    // type?: string;
    rating: number;
    address: string;
    phone: string;
    user_id: string;
    telegram_url?: string;
    description: string;
    image_id?: string;
    is_search_visible?: boolean;
}
export interface HotelFeatures {
    /** Город */
    city: string;
    /** Особенности номера */
    room_features: string[];
    /** Особенности размещения */
    features: string[];
    /** Питание */
    eat: string[];
    /** Тип пляжа */
    beach: string;
    /** Расстояние до пляжа */
    beach_distance: string;
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

export type InfiniteHotelsQueryOptions = {
    /** Во вкладке «Отели» показываем все отели, включая скрытые и без номеров. */
    withEmptyRooms?: boolean;
    /** В поиске/бронировании скрываем отели с is_search_visible = false. */
    excludeHiddenFromSearch?: boolean;
};

//для формы Room и Reserve
export type HotelForRoom = Pick<HotelDTO, 'id' | 'title' | 'telegram_url' | 'phone' | 'address'> & {
    rooms_count?: number;
};

export type HotelWithRoomsCount = HotelDTO & { rooms: { count: number }[] };

async function getHiddenFromSearchHotelIds(): Promise<string[] | null> {
    const { data, error } = await supabase
        .from('hotels')
        .select('id')
        .eq('is_search_visible', false);

    if (error) {
        throw error;
    }

    return data?.map((hotel) => hotel.id) ?? null;
}

const excludeHiddenHotelIds = (
    hotelIds: string[] | undefined,
    hiddenHotelIds: string[] | null,
) => {
    if (!hotelIds) return hotelIds;
    if (!hiddenHotelIds || hiddenHotelIds.length === 0) return hotelIds;

    const hiddenSet = new Set(hiddenHotelIds);
    return hotelIds.filter((id) => !hiddenSet.has(id));
};

const excludeHiddenFreeHotels = (
    hotels: FreeHotelsDTO[],
    hiddenHotelIds: string[] | null,
) => {
    if (!hiddenHotelIds || hiddenHotelIds.length === 0) return hotels;

    const hiddenSet = new Set(hiddenHotelIds);
    return hotels.filter((hotel) => !hiddenSet.has(hotel.hotel_id));
};

const hasValidSearchPeriod = (
    filter?: { start?: number; end?: number },
): filter is { start: number; end: number } =>
    typeof filter?.start === 'number' &&
    typeof filter?.end === 'number' &&
    filter.start < filter.end;

const isMissingRoomClosuresTableError = (error: { code?: string; message?: string }) =>
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.message?.includes('room_closures') === true;

const getClosedRoomIdsForPeriod = async (
    roomIds: string[],
    start: number,
    end: number,
) => {
    if (roomIds.length === 0) {
        return new Set<string>();
    }

    const { data, error } = await supabase
        .from('room_closures')
        .select('room_id')
        .in('room_id', roomIds)
        .lt('start', end)
        .gt('end', start);

    if (error) {
        if (isMissingRoomClosuresTableError(error)) {
            return new Set<string>();
        }

        throw error;
    }

    return new Set((data ?? []).map((closure) => closure.room_id));
};

const excludeClosedFreeRooms = async (
    hotels: FreeHotelsDTO[],
    filter?: { start?: number; end?: number },
) => {
    if (!hasValidSearchPeriod(filter)) {
        return hotels;
    }

    const { start, end } = filter;
    const roomIds = Array.from(
        new Set(hotels.flatMap((hotel) => hotel.rooms.map((room) => room.room_id))),
    );
    const closedRoomIds = await getClosedRoomIdsForPeriod(roomIds, start, end);

    if (closedRoomIds.size === 0) {
        return hotels;
    }

    return hotels
        .map((hotel) => {
            const rooms = hotel.rooms.filter((room) => !closedRoomIds.has(room.room_id));

            return {
                ...hotel,
                rooms,
                free_room_count: rooms.length,
            };
        })
        .filter((hotel) => hotel.rooms.length > 0);
};

const getChessmateStatusFilteredRows = <T extends { title?: string | null }>(
    rows: T[],
    filter?: TravelFilterType,
) => {
    if (!filter?.chessmateStatus) {
        return rows;
    }

    return rows.filter(
        (hotel) => getChessmateHotelHeaderStatus(hotel.title) === filter.chessmateStatus,
    );
};

const getOrderedHotelRows = <T extends { title?: string | null }>(
    rows: T[],
    filter?: TravelFilterType,
) => {
    return sortByChessmateHotelHeaderStatus(getChessmateStatusFilteredRows(rows, filter));
};

/**
 * Получение отелей с комнатами из view hotels_with_rooms с поддержкой пагинации и фильтрации, здесь возвращаются только отели, в которых есть номера
 * @param filter - фильтр для поиска
 * @param page - номер страницы (начиная с 0)
 * @param limit - количество элементов на странице
 * @returns объект с массивом отелей и общим количеством
 */
export async function getAllHotels(
    filter?: TravelFilterType,
    page: number = 0,
    limit: number = 10,
    options?: { excludeHiddenFromSearch?: boolean },
): Promise<{
    data: HotelRoomsReservesDTO[];
    count: number;
}> {
    try {
        const hiddenHotelIds = options?.excludeHiddenFromSearch
            ? await getHiddenFromSearchHotelIds()
            : null;

        // Если есть фильтры (start, end, type, quantity), используем оптимизированную функцию
        // В этом случае расширенные фильтры уже применены через getHotelsWithFreeRooms
        // и результат сохранен в freeHotels_id
        if (
            filter?.freeHotels_id &&
            (filter?.start !== undefined ||
                filter?.end !== undefined ||
                filter?.type !== undefined ||
                filter?.quantity !== undefined)
        ) {
            // Используем стандартный запрос, но фильтруем по freeHotels_id
            const from = page * limit;
            const to = from + limit - 1;

            let filteredHotelIds = excludeHiddenHotelIds(filter.freeHotels_id, hiddenHotelIds);

            if (filter?.hotels && filter?.hotels?.length > 0) {
                const hotels = filter?.hotels.map((hotel) => hotel.id);
                filteredHotelIds = filteredHotelIds?.filter((id) => hotels.includes(id));
            }

            if (!filteredHotelIds || filteredHotelIds.length === 0) {
                return { data: [], count: 0 };
            }

            const query = supabase
                .from('hotels_with_rooms_new')
                .select('*, rooms(*)', { count: 'exact' })
                .in('id', filteredHotelIds)
                .order('title', { ascending: true });

            const response = await query;
            const orderedRows = getOrderedHotelRows(response?.data ?? [], filter);
            const paginatedRows = orderedRows.slice(from, to + 1);

            // Преобразуем HotelRoomsDTO в HotelRoomsReservesDTO (добавляем пустые брони)
            // Если есть фильтр freeHotels (например, по цене), фильтруем номера
            const data: HotelRoomsReservesDTO[] =
                paginatedRows?.map((hotel: any) => {
                    let filteredRooms = hotel.rooms || [];

                    // Если есть фильтр freeHotels (из getHotelsWithFreeRooms), фильтруем номера
                    if (filter?.freeHotels && hotel.id) {
                        const allowedRoomIds = filter.freeHotels.get(hotel.id) || [];
                        // ВАЖНО: фильтруем всегда, даже если allowedRoomIds пустой
                        // Пустой массив означает, что в отеле нет свободных номеров
                        filteredRooms = filteredRooms.filter((room: any) =>
                            allowedRoomIds.includes(room.id),
                        );
                    }

                    return {
                        ...hotel,
                        rooms:
                            filteredRooms.map((room: any) => ({
                                ...room,
                                reserves: [],
                            })) || [],
                    };
                }) || [];

            return {
                data,
                count: orderedRows.length,
            };
        }

        // Для случая без фильтров используем стандартный запрос
        const from = page * limit;
        const to = from + limit - 1;

        const query = supabase
            .from('hotels_with_rooms_new')
            .select('*, rooms(*)', { count: 'exact' });

        if (filter?.freeHotels_id) {
            const visibleFreeHotelIds = excludeHiddenHotelIds(filter.freeHotels_id, hiddenHotelIds);

            if (!visibleFreeHotelIds || visibleFreeHotelIds.length === 0) {
                return { data: [], count: 0 };
            }

            if (filter?.hotels && filter?.hotels?.length > 0) {
                const hotels = filter?.hotels.map((hotel) => hotel.id);
                const filteredByTitle = visibleFreeHotelIds.filter((id) => hotels.includes(id));

                if (filteredByTitle.length === 0) {
                    return { data: [], count: 0 };
                }

                query.in('id', filteredByTitle);
            } else {
                query.in('id', visibleFreeHotelIds);
            }
        }

        if (!filter?.freeHotels_id && filter?.hotels && filter?.hotels?.length > 0) {
            const selectedHotelIds = excludeHiddenHotelIds(
                filter.hotels.map((hotel) => hotel.id),
                hiddenHotelIds,
            );

            if (!selectedHotelIds || selectedHotelIds.length === 0) {
                return { data: [], count: 0 };
            }

            query.in('id', selectedHotelIds);
        }

        if (
            !filter?.freeHotels_id &&
            (!filter?.hotels || filter.hotels.length === 0) &&
            hiddenHotelIds &&
            hiddenHotelIds.length > 0
        ) {
            query.not('id', 'in', `(${hiddenHotelIds.join(',')})`);
        }

        query.order('title', { ascending: true });

        const response = await query;
        const orderedRows = getOrderedHotelRows(response?.data ?? [], filter);
        const paginatedRows = orderedRows.slice(from, to + 1);

        // Преобразуем HotelRoomsDTO в HotelRoomsReservesDTO (добавляем пустые брони)
        // Если есть фильтр freeHotels (например, по цене), фильтруем номера
        const data: HotelRoomsReservesDTO[] =
            paginatedRows?.map((hotel: any) => {
                let filteredRooms = hotel.rooms || [];

                // Если есть фильтр freeHotels (из getHotelsWithFreeRooms), фильтруем номера
                if (filter?.freeHotels && hotel.id) {
                    const allowedRoomIds = filter.freeHotels.get(hotel.id) || [];
                    // ВАЖНО: фильтруем всегда, даже если allowedRoomIds пустой
                    // Пустой массив означает, что в отеле нет свободных номеров
                    filteredRooms = filteredRooms.filter((room: any) =>
                        allowedRoomIds.includes(room.id),
                    );
                }

                // Сортируем номера по полю order перед маппингом
                const sortedRooms = [...filteredRooms].sort((a: any, b: any) => {
                    const orderA = a.order ?? 999; // Если order отсутствует, помещаем в конец
                    const orderB = b.order ?? 999;
                    return orderA - orderB;
                });

                return {
                    ...hotel,
                    rooms:
                        sortedRooms.map((room: any) => ({
                            ...room,
                            reserves: [],
                        })) || [],
                };
            }) || [];

        return {
            data,
            count: orderedRows.length,
        };
    } catch (error) {
        console.error('Ошибка при получении отелей:', error);
        throw error;
    }
}

/**
 * Получение отелей с комнатами из view hotels_with_rooms с поддержкой пагинации и фильтрации, здесь возвращаются только отели, в которых есть номера
 * @param filter - фильтр для поиска
 * @param page - номер страницы (начиная с 0)
 * @param limit - количество элементов на странице
 * @returns объект с массивом отелей и общим количеством
 */
export async function getAllHotelsWithEmptyRooms(
    filter?: TravelFilterType,
    page: number = 0,
    limit: number = 10,
): Promise<{
    data: HotelRoomsReservesDTO[];
    count: number;
}> {
    try {
        const from = page * limit;
        const to = from + limit - 1;

        const query = supabase.from('hotels').select('*, rooms(*)', { count: 'exact' });

        if (filter?.freeHotels_id) {
            query.in('id', filter?.freeHotels_id);
        }

        query.order('title', { ascending: true }).range(from, to);
        const response = await query;

        // Преобразуем HotelRoomsDTO в HotelRoomsReservesDTO (добавляем пустые брони)
        // Если есть фильтр freeHotels (например, по цене), фильтруем номера
        const data: HotelRoomsReservesDTO[] =
            response?.data?.map((hotel: any) => {
                let filteredRooms = hotel.rooms || [];

                // Если есть фильтр freeHotels (из getHotelsWithFreeRooms), фильтруем номера
                if (filter?.freeHotels && hotel.id) {
                    const allowedRoomIds = filter.freeHotels.get(hotel.id) || [];
                    // ВАЖНО: фильтруем всегда, даже если allowedRoomIds пустой
                    // Пустой массив означает, что в отеле нет свободных номеров
                    filteredRooms = filteredRooms.filter((room: any) =>
                        allowedRoomIds.includes(room.id),
                    );
                }

                // Сортируем номера по полю order перед маппингом
                const sortedRooms = [...filteredRooms].sort((a: any, b: any) => {
                    const orderA = a.order ?? 999; // Если order отсутствует, помещаем в конец
                    const orderB = b.order ?? 999;
                    return orderA - orderB;
                });

                return {
                    ...hotel,
                    rooms:
                        sortedRooms.map((room: any) => ({
                            ...room,
                            reserves: [],
                        })) || [],
                };
            }) || [];

        return {
            data,
            count: response.count || 0,
        };
    } catch (error) {
        console.error('Ошибка при получении отелей:', error);
        throw error;
    }
}

/**
 * Получение всех отелей для экспорта (загружает все страницы)
 * @param filter - фильтр для поиска
 * @returns массив всех отелей
 */
export async function getAllHotelsForExport(
    filter?: TravelFilterType,
): Promise<HotelRoomsReservesDTO[]> {
    const LIMIT = 100; // Размер страницы для загрузки
    const allHotels: HotelRoomsReservesDTO[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
        const result = await getAllHotels(filter, page, LIMIT);

        if (result.data && result.data.length > 0) {
            allHotels.push(...result.data);

            // Проверяем, есть ли ещё страницы
            if (result.data.length < LIMIT || allHotels.length >= (result.count || 0)) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }

    return allHotels;
}

/**
 * Хук для бесконечной подгрузки отелей с поддержкой фильтрации
 * @param filter - фильтр для поиска
 * @param limit - количество элементов на странице (по умолчанию 5)
 * @withEmptyRooms - нужно ли в результатах вернуть пустые номера
 */
export const useInfiniteHotelsQuery = (
    filter?: TravelFilterType,
    limit: number = 5,
    options?: boolean | InfiniteHotelsQueryOptions,
) => {
    const resolvedOptions =
        typeof options === 'boolean' ? { withEmptyRooms: options } : (options ?? {});

    return useInfiniteQuery({
        queryKey: QUERY_KEYS.hotels(filter, resolvedOptions),
        queryFn: async ({ pageParam = 0 }) => {
            const result = resolvedOptions.withEmptyRooms
                ? await getAllHotelsWithEmptyRooms(filter, pageParam as number, limit)
                : await getAllHotels(filter, pageParam as number, limit, {
                      excludeHiddenFromSearch: resolvedOptions.excludeHiddenFromSearch,
                  });

            // Возвращаем отели с номерами БЕЗ броней
            // Брони будут загружены в HotelCard через useHotelDetailQuery
            const hotelsWithEmptyReserves: HotelRoomsReservesDTO[] = result.data.map((hotel) => {
                // Сортируем номера по полю order
                const sortedRooms = [...hotel.rooms].sort((a, b) => {
                    const orderA = a.order ?? 999;
                    const orderB = b.order ?? 999;
                    return orderA - orderB;
                });

                return {
                    ...hotel,
                    rooms: sortedRooms.map((room) => ({
                        ...room,
                        reserves: [], // Пустой массив - брони загрузятся отдельно
                    })),
                };
            });

            return {
                ...result,
                data: hotelsWithEmptyReserves,
            };
        },
        initialPageParam: 0,
        getNextPageParam: (
            lastPage: { data: HotelRoomsReservesDTO[]; count: number },
            allPages: {
                data: HotelRoomsReservesDTO[];
                count: number;
            }[],
        ) => {
            if (lastPage.data.length === 0) {
                return undefined;
            }

            const loadedSoFar = allPages.reduce((sum, p) => sum + p.data.length, 0);
            const totalRows = lastPage.count ?? 0;

            // Опираемся на exact count от PostgREST: ответ может быть короче limit (напр. лимит API),
            // при этом следующая страница всё ещё нужна.
            if (totalRows > 0 && loadedSoFar >= totalRows) {
                return undefined;
            }

            // Если count недоступен, сохраняем прежнюю эвристику по размеру последней страницы.
            if (totalRows <= 0 && lastPage.data.length < limit) {
                return undefined;
            }

            return allPages.length;
        },
    });
};

export async function getAllHotelsForRoom(): Promise<HotelForRoom[]> {
    const response = await supabase.from('hotels').select('id, title');
    return response.data as HotelForRoom[]; // Возвращаем массив отелей
}

export async function getAllHotelsForSearch(): Promise<HotelForRoom[]> {
    const response = await supabase
        .from('hotels')
        .select('id, title')
        .eq('is_search_visible', true)
        .order('title');

    if (response.error) {
        throw response.error;
    }

    return (response.data as HotelForRoom[]) ?? [];
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

/**
 * Получение детальных данных конкретного отеля со всеми номерами и бронями
 * Используется для отображения календаря конкретного отеля
 * @param hotelId - ID отеля
 * @param allowedRooms - Массив разрешённых ID номеров для фильтрации (опционально)
 * @returns Отель с полными данными о номерах и бронях
 */
export const getHotelDetail = async (
    hotelId: string,
    allowedRooms?: string[],
): Promise<HotelRoomsReservesDTO> => {
    try {
        if (isYandexBackendProxyClientEnabled()) {
            try {
                return await getHotelCalendarViaYandexBackend(hotelId, allowedRooms);
            } catch (error) {
                console.warn('Yandex backend proxy failed, falling back to Supabase', error);
            }
        }

        // Загружаем базовую информацию об отеле и его номерах
        const { data: hotelData, error: hotelError } = await supabase
            .from('hotels_with_rooms_new')
            .select('*, rooms(*)')
            .eq('id', hotelId)
            .single();

        if (hotelError) throw hotelError;
        if (!hotelData) throw new Error(`Hotel with id ${hotelId} not found`);

        // Фильтруем номера по allowedRooms, если они переданы
        let filteredRooms = hotelData.rooms || [];
        if (allowedRooms && allowedRooms.length > 0) {
            filteredRooms = filteredRooms.filter((room: any) => allowedRooms.includes(room.id));
        } else if (allowedRooms && allowedRooms.length === 0) {
            // Если allowedRooms пустой массив, значит нет доступных номеров
            filteredRooms = [];
        }

        // Загружаем брони для номеров этого отеля
        // Передаём allowedRooms через Map для фильтрации в getReservesByHotels
        const allowedRoomsByHotel = allowedRooms
            ? new Map<string, string[]>([[hotelId, allowedRooms]])
            : undefined;
        const reservesMap = await getReservesByHotels([hotelId], allowedRoomsByHotel);
        const roomsReserves = reservesMap.get(hotelId) || [];

        // Объединяем данные номеров с бронями
        const rooms: RoomReserves[] = filteredRooms.map((room: any) => {
            const roomWithReserves = roomsReserves.find((r) => r.id === room.id);
            const roomTmp = roomWithReserves || {
                ...room,
                reserves: [],
            };
            return roomTmp;
        });
        // Сортируем номера по полю order
        const sortedRooms = [...rooms].sort((a, b) => {
            const orderA = a.order ?? 999;
            const orderB = b.order ?? 999;
            return orderA - orderB;
        });

        return {
            ...hotelData,
            rooms: sortedRooms,
        };
    } catch (error) {
        console.error('Ошибка при получении детальных данных отеля:', error);
        throw error;
    }
};

/**
 * Хук для получения детальных данных конкретного отеля
 * Автоматически обновляется при изменении броней/номеров этого отеля
 * @param hotelId - ID отеля
 * @param allowedRooms - Массив разрешённых ID номеров для фильтрации (опционально)
 * @param enabled - включен ли запрос (по умолчанию true если есть hotelId)
 */
export const useHotelDetailQuery = (
    hotelId?: string,
    allowedRooms?: string[],
    enabled: boolean = true,
) => {
    return useQuery({
        queryKey: hotelId
            ? [
                  ...QUERY_KEYS.hotelDetail(hotelId),
                  allowedRooms ? allowedRooms.slice().sort().join(',') : 'all', // Сортируем для стабильности queryKey
              ]
            : ['hotels', 'detail', 'null'],
        queryFn: () => {
            if (!hotelId) throw new Error('Hotel ID is required');
            return getHotelDetail(hotelId, allowedRooms);
        },
        enabled: enabled && !!hotelId,
        staleTime: 30_000,
        placeholderData: keepPreviousData, // Сохраняем предыдущие данные во время загрузки
    });
};

export const useHotelById = (id: string) => {
    return useQuery({
        queryKey: QUERY_KEYS.hotelById(id),
        queryFn: () => {
            if (!id) throw new Error('Hotel ID is required');
            return getHotelById(id);
        },
        enabled: !!id,
    });
};

export const useGetAllHotels = (
    enabled?: boolean,
    filter?: TravelFilterType,
    select?: (hotels: HotelRoomsDTO[]) => HotelRoomsDTO[],
) => {
    return useQuery({
        queryKey: QUERY_KEYS.hotels(filter),
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
export const useGetHotelsForRoom = (enabled: boolean = true) => {
    return useQuery({
        queryKey: QUERY_KEYS.hotelsForRoom,
        queryFn: getAllHotelsForRoom,
        enabled,
    });
};

export const useGetHotelsForSearch = () => {
    return useQuery({
        queryKey: QUERY_KEYS.hotelsForSearch,
        queryFn: getAllHotelsForSearch,
    });
};

/**
 * Получение отелей с доступностью через RPC функцию get_hotels_with_availability
 * @param filter - базовые фильтры
 * @param parsedAdvancedFilter - расширенные фильтры
 * @param page - номер страницы (начиная с 0)
 * @param limit - количество элементов на странице
 * @returns объект с массивом отелей и общим количеством
 */
/**
 * Преобразует массив строковых ценовых фильтров в числовые значения min и max
 * @param priceFilters - массив строк типа ["up-to-3000", "over-10000"]
 * @returns объект с min_price и max_price числами или null
 */
function parsePriceFilters(priceFilters: string[] | null): {
    min_price: number | null;
    max_price: number | null;
} {
    if (!priceFilters || priceFilters.length === 0) {
        return { min_price: null, max_price: null };
    }

    let minPrice: number | null = null;
    let maxPrice: number | null = null;

    priceFilters.forEach((filter) => {
        // Обработка фильтров типа "up-to-XXXX" (максимальная цена)
        if (filter.startsWith('up-to-')) {
            const value = parseInt(filter.replace('up-to-', ''), 10);
            if (!isNaN(value)) {
                // Для max_price берём минимальное значение из всех "up-to"
                if (maxPrice === null || value < maxPrice) {
                    maxPrice = value;
                }
            }
        }
        // Обработка фильтров типа "over-XXXX" (минимальная цена)
        else if (filter.startsWith('over-')) {
            const value = parseInt(filter.replace('over-', ''), 10);
            if (!isNaN(value)) {
                // Для min_price берём максимальное значение из всех "over"
                if (minPrice === null || value > minPrice) {
                    minPrice = value;
                }
            }
        }
    });

    return { min_price: minPrice, max_price: maxPrice };
}

export async function getHotelsWithAvailability(
    filter: {
        start?: number;
        end?: number;
        type?: string;
        quantity?: number;
    },
    parsedAdvancedFilter?: Record<string, string[] | null>,
    page: number = 0,
    limit: number = 10,
): Promise<{
    data: HotelRoomsDTO[];
    count: number;
}> {
    try {
        const priceFilters = parsePriceFilters(parsedAdvancedFilter?.price ?? null);

        const default_filter = {
            start_time: filter?.start ?? null,
            end_time: filter?.end ?? null,
            // Фильтр типа теперь относится к типу номера (rooms.type),
            // поэтому параметр функции называется room_type_filter.
            room_type_filter: filter?.type ?? null,
            min_quantity_filter: filter?.quantity ?? null,
            city_filter: parsedAdvancedFilter?.city ?? null,
            room_features_filter: parsedAdvancedFilter?.roomFeatures ?? null,
            features_filter: parsedAdvancedFilter?.features ?? null,
            eat_filter: parsedAdvancedFilter?.eat ?? null,
            beach_filter: parsedAdvancedFilter?.beach ?? null,
            beach_distance_filter: parsedAdvancedFilter?.beachDistance ?? null,
            min_price_filter: priceFilters.min_price,
            max_price_filter: priceFilters.max_price,
        };

        const { data: rpcData, error: rpcError } = await supabase.rpc(
            'get_hotels_with_availability',
            default_filter,
        );

        if (rpcError) {
            throw rpcError;
        }

        if (!rpcData || rpcData.length === 0) {
            return { data: [], count: 0 };
        }

        // Применяем пагинацию к результатам
        const from = page * limit;
        const to = from + limit;
        const paginatedData = rpcData.slice(from, to);

        // Получаем все ID отелей из результатов
        const hotelIds = paginatedData.map((hotelData: any) => hotelData.hotel_id);

        if (hotelIds.length === 0) {
            return { data: [], count: rpcData.length };
        }

        // Получаем все отели одним запросом
        const { data: hotelsInfo, error: hotelsError } = await supabase
            .from('hotels')
            .select('*')
            .in('id', hotelIds);

        if (hotelsError) {
            throw hotelsError;
        }

        // Создаем Map для быстрого доступа к информации об отелях
        const hotelsMap = new Map(
            (hotelsInfo || []).map((hotel: any) => [hotel.id, hotel as HotelDTO]),
        );

        // Преобразуем результат RPC в формат HotelRoomsDTO
        const hotelsData: HotelRoomsDTO[] = paginatedData
            .map((hotelData: any): HotelRoomsDTO | null => {
                const hotelInfo = hotelsMap.get(hotelData.hotel_id);

                if (!hotelInfo) {
                    return null;
                }

                // Преобразуем номера из JSON формата
                const rooms: RoomDTO[] = Array.isArray(hotelData.rooms)
                    ? hotelData.rooms.map((room: any) => ({
                          id: room.room_id || room.id,
                          hotel_id: hotelData.hotel_id,
                          title: room.room_title || room.title || '',
                          price: room.room_price || room.price || 0,
                          quantity: room.room_quantity || room.quantity || 0,
                          // Тип номера приходит из функции get_available_hotels как r.type / room_type.
                          type: room.room_type || room.type || null,
                          image_title: room.image_title || '',
                          image_path: room.image_path || '',
                          comment: room.comment,
                          room_features: room.room_features || [],
                          order: room.order || 0,
                      }))
                    : [];

                return {
                    ...hotelInfo,
                    rooms,
                };
            })
            .filter((hotel: HotelRoomsDTO | null): hotel is HotelRoomsDTO => hotel !== null);

        return {
            data: hotelsData,
            count: rpcData.length,
        };
    } catch (error) {
        console.error('Ошибка при получении отелей с доступностью:', error);
        throw error;
    }
}

export async function getHotelsWithFreeRooms(
    filter: {
        start?: number;
        end?: number;
        type?: string;
        quantity?: number;
    },
    parsedAdvancedFilter?: Record<string, string[] | null>,
): Promise<FreeHotelsDTO[]> {
    try {
        const priceFilters = parsePriceFilters(parsedAdvancedFilter?.price ?? null);

        const default_filter = {
            start_time: filter?.start ?? null,
            end_time: filter?.end ?? null,
            room_type_filter: filter?.type ?? null,
            min_quantity_filter: filter?.quantity ?? null,
            city_filter: parsedAdvancedFilter?.city ?? null,
            room_features_filter: parsedAdvancedFilter?.roomFeatures ?? null,
            features_filter: parsedAdvancedFilter?.features ?? null,
            eat_filter: parsedAdvancedFilter?.eat ?? null,
            beach_filter: parsedAdvancedFilter?.beach ?? null,
            beach_distance_filter: parsedAdvancedFilter?.beachDistance ?? null,
            min_price_filter: priceFilters.min_price,
            max_price_filter: priceFilters.max_price,
        };

        const [{ data }, hiddenHotelIds] = await Promise.all([
            supabase.rpc('get_available_hotels', default_filter),
            getHiddenFromSearchHotelIds(),
        ]);

        const visibleHotels = excludeHiddenFreeHotels(
            (data ?? []) as FreeHotelsDTO[],
            hiddenHotelIds,
        );

        return excludeClosedFreeRooms(visibleHotels, filter);
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

/**
 * Совместимая версия фильтрации по бассейнам:
 * - новый путь: frame-pool/capital-pool в hotel.features
 * - legacy путь: pool в room_features
 *
 * При активном бассейне в features выполняет оба запроса и объединяет комнаты,
 * чтобы не ломать поиск во время миграции данных.
 */
export async function getHotelsWithFreeRoomsCompatible(
    filter: {
        start?: number;
        end?: number;
        type?: string;
        quantity?: number;
    },
    parsedAdvancedFilter?: Record<string, string[] | null>,
): Promise<FreeHotelsDTO[]> {
    const selectedFeatures = parsedAdvancedFilter?.features ?? [];
    const poolFeatureValues = ['pool', 'frame-pool', 'capital-pool'];
    const poolInHotelFeatures = selectedFeatures.some((feature) =>
        poolFeatureValues.includes(feature),
    );

    if (!poolInHotelFeatures) {
        return getHotelsWithFreeRooms(filter, parsedAdvancedFilter);
    }

    const legacyFeatures = selectedFeatures.filter((feature) => !poolFeatureValues.includes(feature));
    const legacyRoomFeatures = Array.from(
        new Set([...(parsedAdvancedFilter?.roomFeatures ?? []), 'pool']),
    );

    const legacyFilter: Record<string, string[] | null> = {
        ...(parsedAdvancedFilter ?? {}),
        features: legacyFeatures.length > 0 ? legacyFeatures : null,
        roomFeatures: legacyRoomFeatures,
    };

    const [legacyResult, modernResult] = await Promise.all([
        getHotelsWithFreeRooms(filter, legacyFilter),
        getHotelsWithFreeRooms(filter, parsedAdvancedFilter),
    ]);

    const byHotel = new Map<
        string,
        {
            hotel_id: string;
            hotel_title: string;
            rooms: Map<string, FreeHotelsDTO['rooms'][number]>;
        }
    >();

    const appendHotels = (hotels: FreeHotelsDTO[]) => {
        hotels.forEach((hotel) => {
            const current = byHotel.get(hotel.hotel_id) ?? {
                hotel_id: hotel.hotel_id,
                hotel_title: hotel.hotel_title,
                rooms: new Map<string, FreeHotelsDTO['rooms'][number]>(),
            };

            hotel.rooms.forEach((room) => {
                current.rooms.set(room.room_id, room);
            });

            byHotel.set(hotel.hotel_id, current);
        });
    };

    appendHotels(legacyResult);
    appendHotels(modernResult);

    return Array.from(byHotel.values()).map((hotel) => ({
        hotel_id: hotel.hotel_id,
        hotel_title: hotel.hotel_title,
        rooms: Array.from(hotel.rooms.values()),
        free_room_count: hotel.rooms.size,
    }));
}

export const createHotelApi = async (hotel: Hotel) => {
    const { error } = await insertItem<Hotel>(TABLE_NAMES.HOTELS, hotel);

    if (error) {
        throw new Error(error.message);
    }
};

export const updateHotelApi = async ({ id, ...hotel }: HotelDTO) => {
    if (!id) {
        throw new Error('Hotel ID is required');
    }

    const { data, error } = await supabase
        .from('hotels')
        .update(hotel)
        .eq('id', id)
        .select('id')
        .single();

    if (error) {
        throw new Error(error.message);
    }

    return data;
};

export const deleteHotelApi = async (id: string) => {
    const { data, error } = await supabase.from('hotels').delete().eq('id', id).select('id').single();

    if (error) {
        throw new Error(error.message);
    }

    return data;
};

export const useCreateHotel = (onSuccess: () => void, onError?: (e: Error) => void) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (hotel: Hotel) => {
            return createHotelApi(hotel);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['hotels', 'list'],
            });
            onSuccess();
        },
        onError: (err) => {
            showToast(`Ошибка при добавлении отеля: ${(err as Error).message}`, 'error');
            onError?.(err as Error);
        },
    });
};

export const useUpdateHotel = (
    hotelId?: string,
    onSuccess?: () => void,
    onError?: (e: Error) => void,
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: updateHotelApi,
        onSuccess: async (_data, variables) => {
            const id = hotelId || variables.id;
            if (id) {
                await invalidateHotelChessmateQueries(queryClient, id, {
                    includeHotelList: true,
                });
            } else {
                await queryClient.invalidateQueries({
                    queryKey: ['hotels', 'list'],
                });
            }
            onSuccess?.();
        },
        onError: (err) => {
            showToast(`Ошибка при обновлении отеля: ${(err as Error).message}`, 'error');
            onError?.(err as Error);
        },
    });
};

export const useDeleteHotel = (
    hotelId?: string,
    onSuccess?: () => void,
    onError?: (e: Error) => void,
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: deleteHotelApi,
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['hotels', 'list'],
            });
            if (hotelId) {
                queryClient.removeQueries({
                    queryKey: QUERY_KEYS.hotelDetail(hotelId),
                });
                queryClient.removeQueries({
                    queryKey: QUERY_KEYS.hotelById(hotelId),
                });
            }
            onSuccess?.();
        },
        onError: (err) => {
            showToast(`Ошибка при удалении отеля: ${(err as Error).message}`, 'error');
            onError?.(err as Error);
        },
    });
};

export const createImageApi = async (fileName: string, file: File) => {
    try {
        await supabase.storage
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
