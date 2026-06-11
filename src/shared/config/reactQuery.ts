import { QueryClient } from '@tanstack/react-query'
import { InfiniteHotelsQueryOptions } from '@/shared/api/hotel/hotel'
import { TravelFilterType } from '@/shared/models/hotels'

export const QUERY_KEYS = {
  // Список отелей с фильтрами (infinite query) - только базовая информация
  hotels: (filter?: TravelFilterType, options?: InfiniteHotelsQueryOptions) =>
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
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
})
