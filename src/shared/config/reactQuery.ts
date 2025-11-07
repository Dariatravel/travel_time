import { QueryClient } from '@tanstack/react-query'
import { TravelFilterType } from '@/shared/models/hotels'

export const QUERY_KEYS = {
  // Список отелей с фильтрами (infinite query) - только базовая информация
  hotels: (filter?: TravelFilterType) => ['hotels', 'list', filter] as const,

  // Конкретный отель со всеми номерами и бронями
  hotelDetail: (hotelId: string) => ['hotels', 'detail', hotelId] as const,

  // Устаревшие ключи (для совместимости, постепенно удалим)
  hotelById: ['hotel', 'id'],
  rooms: ['rooms'],
  roomsByHotel: ['roomsByHotel'],
  roomsWithReservesByHotel: ['roomsWithReservesByHotel'],
  hotelsForRoom: ['hotelsForRoom'],
  createReserve: 'createReserve',
  updateReserve: 'updateReserve',
  allCounts: ['hotels', 'counts'],
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
})
