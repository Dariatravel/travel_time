import { FreeHotelsDTO } from '@/shared/api/hotel/hotel';
import { createEvent, createStore } from 'effector';

/**
 * Event для обновления данных о свободных отелях
 */
export const setFreeHotelsData = createEvent<FreeHotelsDTO[]>();

/**
 * Event для очистки данных о свободных отелях
 */
export const clearFreeHotelsData = createEvent();

/**
 * Store для хранения данных о свободных отелях
 * Содержит информацию о номерах, которые свободны в указанный период
 */
export const $freeHotelsData = createStore<FreeHotelsDTO[]>([])
    .on(setFreeHotelsData, (_, freeHotels) => freeHotels)
    .reset(clearFreeHotelsData);

/**
 * Derived store - получаем Map для быстрого доступа к данным по hotel_id
 */
export const $freeHotelsMap = $freeHotelsData.map((freeHotels) => {
    const map = new Map<string, FreeHotelsDTO>();
    freeHotels.forEach((hotel) => {
        map.set(hotel.hotel_id, hotel);
    });
    return map;
});

/**
 * Derived store - получаем массив ID отелей со свободными номерами
 */
export const $freeHotelIds = $freeHotelsData.map((freeHotels) =>
    freeHotels.map((hotel) => hotel.hotel_id),
);

/**
 * Derived store - получаем общее количество свободных номеров
 */
export const $totalFreeRooms = $freeHotelsData.map((freeHotels) =>
    freeHotels.reduce((sum, hotel) => sum + hotel.free_room_count, 0),
);

/**
 * Derived store - проверяем, есть ли свободные номера
 */
export const $hasFreeRooms = $freeHotelsData.map((freeHotels) => freeHotels.length > 0);
