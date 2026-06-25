import { QueryClient } from '@tanstack/react-query'
import { TravelFilterType } from '@/shared/models/hotels'

export const QUERY_KEYS = {
  // Список отелей с фильтрами (infinite query) - только базовая информация
  hotels: (filter?: TravelFilterType, options?: Record<string, unknown>) =>
    ['hotels', 'list', filter, options] as const,

  // Конкретный отель со всеми номерами и бронями
  hotelDetail: (hotelId: string) => ['hotels', 'detail', hotelId] as const,

  // Отель по id (страница календаря / хлебные крошки)
  hotelById: (hotelId: string) => ['hotel', 'id', hotelId] as const,
  /** Префикс для инвалидации всех hotelById-запросов */
  hotelByIdPrefix: ['hotel', 'id'] as const,
  rooms: ['rooms'],
  roomsByHotel: ['roomsByHotel'],
  roomsWithReservesByHotel: ['roomsWithReservesByHotel'],
  hotelsForRoom: ['hotelsForRoom'],
  hotelsForSearch: ['hotelsForSearch'],
  createReserve: 'createReserve',
  updateReserve: 'updateReserve',
  allCounts: ['hotels', 'counts'],
  reserveHistory: (reserveId: string) => ['reserveHistory', reserveId] as const,
  reserveHistoryPrefix: ['reserveHistory'] as const,
  recentActivity: ['activity', 'recent'] as const,
  roomClosuresByHotel: (hotelId: string) => ['roomClosures', hotelId] as const,
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
})

/** Обновляет все кэши, от которых зависит шахматка после изменения отеля/номера. */
export async function invalidateHotelChessmateQueries(
  queryClient: QueryClient,
  hotelId: string,
) {
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
    queryClient.invalidateQueries({
      queryKey: ['hotels', 'list'],
    }),
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.roomsByHotel,
    }),
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.hotelsForRoom,
    }),
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.hotelsForSearch,
    }),
  ])
}
