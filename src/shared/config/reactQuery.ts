import { QueryClient } from '@tanstack/react-query'
import { TravelFilterType } from '@/shared/models/hotels'

const toHotelsQueryKeyFilter = (filter?: TravelFilterType) => {
  if (!filter) return filter

  const filterWithoutLoading = { ...filter }
  delete filterWithoutLoading.isLoading
  const { freeHotels, hotels, ...rest } = filterWithoutLoading

  return {
    ...rest,
    hotels: hotels?.map((hotel) => hotel.id).sort(),
    freeHotels: freeHotels
      ? Array.from(freeHotels.entries())
          .map(([hotelId, roomIds]) => [hotelId, [...roomIds].sort()] as const)
          .sort((a, b) => a[0].localeCompare(b[0]))
      : undefined,
  }
}

export const QUERY_KEYS = {
  // Список отелей с фильтрами (infinite query) - только базовая информация
  hotels: (filter?: TravelFilterType, options?: Record<string, unknown>) =>
    ['hotels', 'list', toHotelsQueryKeyFilter(filter), options] as const,

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
  operationsCenter: ['operationsCenter'] as const,
  roomClosuresByHotel: (hotelId: string) => ['roomClosures', hotelId] as const,
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
})

/** Обновляет кэши шахматки после изменения отеля/номера без лишнего refetch всей страницы. */
export async function invalidateHotelChessmateQueries(
  queryClient: QueryClient,
  hotelId: string,
  options: { includeHotelList?: boolean } = {},
) {
  const tasks = [
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
      queryKey: QUERY_KEYS.roomsByHotel,
    }),
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.hotelsForRoom,
    }),
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.hotelsForSearch,
    }),
  ]

  if (options.includeHotelList) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: ['hotels', 'list'],
      }),
    )
  }

  await Promise.all(tasks)
}
