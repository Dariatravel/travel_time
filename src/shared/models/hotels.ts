import { Nullable } from '@/shared/api/reserve/reserve';
import { createEvent, createStore } from 'effector';

export type TravelFilterType = Nullable<{
    type?: string;
    quantity?: number;
    start?: number;
    end?: number;
    hotels_id?: string[];
    rooms_id?: Map<string, string[]>;
    hotels?: { hotel_id: string; rooms: string[] }[];
}>;

const changeTravelFilter = createEvent<TravelFilterType>();

// Создаем стор для хранения пользователей
const $hotelsFilter = createStore<TravelFilterType>(null).on(changeTravelFilter, (state, newFilter) => {
    return { ...state, ...newFilter };
});

// Экспортируем стор и событие
export { $hotelsFilter, changeTravelFilter };
