import { HotelDTO } from '@/shared/api/hotel/hotel';

/**
 * Возвращает абсолютный URL для страницы бронирования конкретного отеля.
 *
 * @param hotel - Объект отеля, содержащий уникальный идентификатор (id).
 * @returns Абсолютный URL для перехода на страницу бронирования данного отеля.
 *
 * @example
 * const hotel: HotelDTO = { id: 123, ... };
 * const url = getHotelUrl(hotel);
 * // url: "https://example.com/main/reservation/123"
 */
export const getHotelUrl = (hotel: HotelDTO): string => {
    // Получаем origin текущего окна (например, https://example.com)
    const origin = window.location.origin;

    // Формируем абсолютный путь к странице бронирования отеля
    return `${origin}/main/reservation/${hotel.id}`;
};
