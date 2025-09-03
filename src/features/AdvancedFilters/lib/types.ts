/**
 * Типы для расширенной фильтрации номеров отелей
 */

export interface FilterOption {
    /** Уникальный идентификатор опции */
    id: string;
    /** Отображаемое название */
    label: string;
    /** Значение для фильтрации */
    value: string;
    /** Активна ли опция */
    isActive: boolean;
}

export interface FilterSection {
    /** Уникальный идентификатор секции */
    id: string;
    /** Заголовок секции */
    title: string;
    /** Опции фильтра */
    options: FilterOption[];
    /** По умолчанию раскрыта ли секция */
    isExpanded?: boolean;
}

export interface HotelFilters {
    /** Фильтр по городу */
    city: FilterSection;
}

export interface RoomFilters {
    /** Особенности номера */
    features: FilterSection;
    /** Особенности размещения */
    accommodation: FilterSection;
    /** Питание */
    nutrition: FilterSection;
    /** Тип пляжа */
    beach: FilterSection;
    /** Расстояние до пляжа */
    beachDistance: FilterSection;
    /** Ценовой диапазон */
    price: FilterSection;
}

export interface AdvancedFiltersState {
    /** Фильтры по отелю */
    hotel: HotelFilters;
    /** Фильтры по номеру */
    room: RoomFilters;
}

export interface FilterChangeEvent {
    /** ID секции */
    sectionId: string;
    /** ID опции */
    optionId: string;
    /** Новое состояние активности */
    isActive: boolean;
}

