import { TABLE_NAMES } from '@/shared/api/const';
import { ReserveDTO, TravelOption, getReservesByHotels } from '@/shared/api/reserve/reserve';
import { Room, RoomDTO, RoomReserves } from '@/shared/api/room/room';
import { QUERY_KEYS } from '@/shared/config/reactQuery';
import supabase from '@/shared/config/supabase';
import { TravelFilterType } from '@/shared/models/hotels';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';

// Тип Room
export interface HotelImage {
    id: string;
    file: File;
}

export interface Hotel extends HotelFeatures {
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

//для формы Room и Reserve
export type HotelForRoom = Pick<HotelDTO, 'id' | 'title' | 'telegram_url' | 'phone' | 'address'>;

export type HotelWithRoomsCount = HotelDTO & { rooms: { count: number }[] };

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
): Promise<{
    data: HotelRoomsReservesDTO[];
    count: number;
}> {
    try {
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

            let filteredHotelIds = filter.freeHotels_id;

            if (filter?.hotels && filter?.hotels?.length > 0) {
                const hotels = filter?.hotels.map((hotel) => hotel.id);
                filteredHotelIds = filter?.freeHotels_id?.filter((id) => hotels.includes(id));
            }

            const query = supabase
                .from('hotels_with_rooms_new')
                .select('*, rooms(*)', { count: 'exact' })
                .in('id', filteredHotelIds)
                .order('title', { ascending: true })
                .range(from, to);

            const response = await query;

            // Преобразуем HotelRoomsDTO в HotelRoomsReservesDTO (добавляем пустые брони)
            // Если есть фильтр freeHotels (например, по цене), фильтруем номера
            const data: HotelRoomsReservesDTO[] =
                response?.data?.map((hotel: any) => {
                    let filteredRooms = hotel.rooms || [];

                    // Если есть фильтр freeHotels (из getHotelsWithFreeRooms), фильтруем номера
                    if (filter?.freeHotels && hotel.id) {
                        const allowedRoomIds = filter.freeHotels.get(hotel.id) || [];
                        if (allowedRoomIds.length > 0) {
                            filteredRooms = filteredRooms.filter((room: any) =>
                                allowedRoomIds.includes(room.id),
                            );
                        }
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
                count: response.count || 0,
            };
        }

        // Для случая без фильтров используем стандартный запрос
        const from = page * limit;
        const to = from + limit - 1;

        const query = supabase
            .from('hotels_with_rooms_new')
            .select('*, rooms(*)', { count: 'exact' });

        if (filter?.freeHotels_id) {
            if (filter?.hotels && filter?.hotels?.length > 0) {
                const hotels = filter?.hotels.map((hotel) => hotel.id);
                const filteredByTitle = filter?.freeHotels_id?.filter((id) => hotels.includes(id));

                query.in('id', filteredByTitle);
            } else {
                query.in('id', filter?.freeHotels_id);
            }
        }

        if (!filter?.freeHotels_id && filter?.hotels && filter?.hotels?.length > 0) {
            query.in(
                'id',
                filter?.hotels.map((hotel) => hotel.id),
            );
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
                    if (allowedRoomIds.length > 0) {
                        filteredRooms = filteredRooms.filter((room: any) =>
                            allowedRoomIds.includes(room.id),
                        );
                    }
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
                    if (allowedRoomIds.length > 0) {
                        filteredRooms = filteredRooms.filter((room: any) =>
                            allowedRoomIds.includes(room.id),
                        );
                    }
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
    withEmptyRooms?: boolean,
) => {
    return useInfiniteQuery({
        queryKey: [...QUERY_KEYS.hotels],
        queryFn: async ({ pageParam = 0 }) => {
            const result = withEmptyRooms
                ? await getAllHotelsWithEmptyRooms(filter, pageParam as number, limit)
                : await getAllHotels(filter, pageParam as number, limit);

            // Если есть отели, загружаем брони параллельно
            if (result.data && result.data.length > 0) {
                // Фильтруем пустые и невалидные UUID перед запросом
                const hotelIds = result.data
                    .map((hotel) => hotel.id)
                    .filter((id) => id && typeof id === 'string' && id.trim() !== '');

                const reservesMap =
                    hotelIds.length > 0
                        ? await getReservesByHotels(hotelIds)
                        : new Map<string, RoomReserves[]>();

                // Объединяем данные отелей с бронями
                const hotelsWithReserves: HotelRoomsReservesDTO[] = result.data.map((hotel) => {
                    const roomsReserves = reservesMap.get(hotel.id) || [];
                    // Преобразуем RoomDTO[] в RoomReserves[] если нужно
                    const rooms = hotel.rooms.map((room) => {
                        const roomWithReserves = roomsReserves.find((r) => r.id === room.id);
                        return (
                            roomWithReserves || {
                                ...room,
                                reserves: [],
                            }
                        );
                    });
                    // Сортируем номера по полю order
                    const sortedRooms = [...rooms].sort((a, b) => {
                        const orderA = a.order ?? 999; // Если order отсутствует, помещаем в конец
                        const orderB = b.order ?? 999;
                        return orderA - orderB;
                    });
                    return {
                        ...hotel,
                        rooms: sortedRooms,
                    };
                });

                return {
                    ...result,
                    data: hotelsWithReserves,
                };
            }

            // Если нет данных, возвращаем с пустыми бронями для соответствия типу
            return {
                ...result,
                data: result.data.map((hotel) => ({
                    ...hotel,
                    rooms: hotel.rooms.map((room) => ({
                        ...room,
                        reserves: [],
                    })),
                })),
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
            // Если последняя страница пустая или количество загруженных элементов равно общему количеству, то больше страниц нет
            if (lastPage.data.length === 0 || lastPage.data.length < limit) {
                return undefined;
            }

            // Возвращаем номер следующей страницы
            return allPages.length;
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

export const useGetAllHotels = (
    enabled?: boolean,
    filter?: TravelFilterType,
    select?: (hotels: HotelRoomsDTO[]) => HotelRoomsDTO[],
) => {
    return useQuery({
        queryKey: [...QUERY_KEYS.hotels],
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
            hotel_type_filter: filter?.type ?? null,
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
            hotel_type_filter: filter?.type ?? null,
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

        const { data } = await supabase.rpc('get_available_hotels', default_filter);

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
