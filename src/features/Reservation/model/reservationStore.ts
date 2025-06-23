import { getHotelsWithFreeRooms } from '@/shared/api/hotel/hotel';
import { changeTravelFilter } from '@/shared/models/hotels';
import { createEffect, createStore, sample } from 'effector';

// Эффект для запроса getHotelsWithFreeRooms
export const getHotelsWithFreeRoomsFx = createEffect(async ({ start, end, quantity, type }: { start?: number; end?: number; quantity?: number; type?: string }) => {
    const result = await getHotelsWithFreeRooms({ start, end, quantity, type });
    return result;
});

// Хранилище для состояния загрузки
export const $isHotelsWithFreeRoomsLoading = createStore(false)
    .on(getHotelsWithFreeRoomsFx, () => true) // Устанавливаем true при начале запроса
    .on(getHotelsWithFreeRoomsFx.finally, () => false); // Устанавливаем false при завершении

// Проброс данных в changeTravelFilter через sample
sample({
    source: getHotelsWithFreeRoomsFx.doneData, // Источник данных
    fn: (result) => ({
        hotels_id: result?.map((hotel) => hotel.hotel_id),
        rooms_id: new Map(result?.map((hotel) => [hotel.hotel_id, hotel.rooms.map((room) => room.room_id)])),
    }),
    target: changeTravelFilter, // Цель (эффект или событие)
});
