import { Nullable } from '@/shared/api/reserve/reserve';
import { createEvent, createStore } from 'effector';

export type TravelFilterType = Nullable<{
    type?: string;
    quantity?: number;
    start?: number;
    end?: number;
    // информация о найденных свободных номерах отелей
    hotels?: Map<string, string[]>;
    hotels_id?: string[];
}>;

const changeTravelFilter = createEvent<TravelFilterType>();

// Создаем стор для хранения пользователей
const $hotelsFilter = createStore<TravelFilterType>(null).on(changeTravelFilter, (state, newFilter) => {
    return { ...state, ...newFilter };
});

// Экспортируем стор и событие
export { $hotelsFilter, changeTravelFilter };
