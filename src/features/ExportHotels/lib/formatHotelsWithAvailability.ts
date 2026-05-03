import { FreeHotelsDTO, HotelForRoom } from '@/shared/api/hotel/hotel';
import { urlPlainForExport } from './formatHotels';

/**
 * Форматирует список отелей с информацией о свободных номерах
 * @param hotels - массив отелей
 * @param freeHotelsData - данные о свободных номерах
 * @returns отформатированная строка для копирования
 */
export const formatHotelsWithAvailability = (
    hotels: HotelForRoom[],
    freeHotelsData?: FreeHotelsDTO[],
): string => {
    if (!hotels || hotels.length === 0) {
        return 'Нет доступных отелей для экспорта';
    }

    const header = '📋 Список отелей\n\n';

    // Создаем Map для быстрого поиска данных о свободных номерах
    const freeHotelsMap = new Map<string, FreeHotelsDTO>();
    freeHotelsData?.forEach((freeHotel) => {
        freeHotelsMap.set(freeHotel.hotel_id, freeHotel);
    });

    const hotelsList = hotels
        .map((hotel, index) => {
            const number = `${index + 1}.`;
            const title = hotel.title || 'Без названия';
            const telegramLink = urlPlainForExport(hotel.telegram_url);

            let hotelText = `${number} ${title}\n   ${telegramLink}`;

            hotelText += `\n   ✅ Свободных номеров: ${hotel?.rooms_count}`;

            return hotelText;
        })
        .join('\n\n');

    return `${header}${hotelsList}`;
};

/**
 * Форматирует только отели со свободными номерами
 * @param freeHotelsData - данные о свободных номерах
 * @returns отформатированная строка
 */
export const formatOnlyAvailableHotels = (freeHotelsData: FreeHotelsDTO[]): string => {
    if (!freeHotelsData || freeHotelsData.length === 0) {
        return 'Нет свободных номеров';
    }

    const header = '📋 Отели со свободными номерами\n\n';

    const hotelsList = freeHotelsData
        .map((freeHotel, index) => {
            const number = `${index + 1}.`;
            const title = freeHotel.hotel_title || 'Без названия';
            const freeCount = freeHotel.free_room_count;

            let hotelText = `${number} ${title}\n   ✅ Свободных номеров: ${freeCount}`;

            // Добавляем информацию о каждом номере
            if (freeHotel.rooms && freeHotel.rooms.length > 0) {
                freeHotel.rooms.forEach((room) => {
                    hotelText += `\n   📍 ${room.room_title} - ${room.room_price} руб.`;
                });
            }

            return hotelText;
        })
        .join('\n\n');

    return `${header}${hotelsList}`;
};

/**
 * Форматирует краткую сводку по свободным номерам
 * @param freeHotelsData - данные о свободных номерах
 * @returns краткая сводка
 */
export const formatAvailabilitySummary = (freeHotelsData: FreeHotelsDTO[]): string => {
    if (!freeHotelsData || freeHotelsData.length === 0) {
        return 'Нет данных о свободных номерах';
    }

    const totalHotels = freeHotelsData.length;
    const totalRooms = freeHotelsData.reduce((sum, hotel) => sum + hotel.free_room_count, 0);

    const header = `📊 Сводка по доступности\n\n`;
    const summary = `Отелей со свободными номерами: ${totalHotels}\nВсего свободных номеров: ${totalRooms}\n\n`;

    const hotelsList = freeHotelsData
        .map(
            (hotel) =>
                `• ${hotel.hotel_title}: ${hotel.free_room_count} ${hotel.free_room_count === 1 ? 'номер' : 'номеров'}`,
        )
        .join('\n');

    return `${header}${summary}${hotelsList}`;
};
