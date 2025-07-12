import { QueryClient } from '@tanstack/react-query'

export const QUERY_KEYS = {
  hotels: ['hotels'],
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
