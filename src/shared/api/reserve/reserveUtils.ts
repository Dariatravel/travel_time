import { HotelRoomsReservesDTO } from '@/shared/api/hotel/hotel';
import { ReserveDTO } from '@/shared/api/reserve/reserve';
import { QUERY_KEYS } from '@/shared/config/reactQuery';
import { InfiniteData, QueryClient } from '@tanstack/react-query';

/**
 * Обновляет кэш infinite query для отелей, добавляя/обновляя/удаляя бронь в конкретном номере конкретного отеля
 * Обновляет только нужный отель и номер, без перезапроса всех данных
 */
export function updateReserveInCache(
    queryClient: QueryClient,
    reserve: ReserveDTO,
    hotelId: string,
    roomId: string,
    operation: 'create' | 'update' | 'delete',
) {
    queryClient.setQueryData<InfiniteData<{ data: HotelRoomsReservesDTO[]; count: number }>>(
        QUERY_KEYS.hotels,
        (oldData) => {
            if (!oldData) return oldData;

            return {
                ...oldData,
                pages: oldData.pages.map((page) => ({
                    ...page,
                    data: page.data.map((hotel) => {
                        // Обновляем только нужный отель
                        if (hotel.id !== hotelId) return hotel;

                        return {
                            ...hotel,
                            rooms: hotel.rooms.map((room) => {
                                // Обновляем только нужный номер
                                if (room.id !== roomId) return room;

                                let updatedReserves;
                                if (operation === 'delete') {
                                    // Удаляем бронь по ID
                                    updatedReserves = room.reserves.filter(
                                        (r) => r.id !== reserve.id,
                                    );
                                } else if (operation === 'create') {
                                    // Добавляем новую бронь
                                    updatedReserves = [...room.reserves, reserve];
                                } else {
                                    // Обновляем существующую бронь
                                    updatedReserves = room.reserves.map((r) =>
                                        r.id === reserve.id ? { ...r, ...reserve } : r,
                                    );
                                }

                                return {
                                    ...room,
                                    reserves: updatedReserves,
                                };
                            }),
                        };
                    }),
                })),
            };
        },
    );
}
