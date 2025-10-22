import { HotelForRoom } from '@/shared/api/hotel/hotel';
import { Nullable } from '@/shared/api/reserve/reserve';
import { createEvent, createStore } from 'effector';

export type TravelFilterType = Nullable<{
    type?: string;
    quantity?: number;
    start?: number;
    end?: number;
    // информация о найденных свободных номерах отелей
    freeHotels?: Map<string, string[]>;
    freeHotels_id?: string[];

    // список отелей для поиска
    hotels?: HotelForRoom[];

    // расширенные фильтры
    roomFeatures?: string[];

    // состояние загрузки
    isLoading?: boolean;
}>;

const changeTravelFilter = createEvent<TravelFilterType>();
const setLoading = createEvent<boolean>();

// Создаем стор для хранения пользователей
const $hotelsFilter = createStore<TravelFilterType>(null)
    .on(changeTravelFilter, (state, newFilter) => {
        return { ...state, ...newFilter };
    })
    .on(setLoading, (state, isLoading) => {
        return { ...state, isLoading };
    });

// Экспортируем стор и события
export { $hotelsFilter, changeTravelFilter, setLoading };
