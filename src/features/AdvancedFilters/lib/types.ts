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

export interface QueryStringFilter {
    [key: string]: string;
    beachType?: string;
    beachDistance?: string;
    eat?: string;
    roomType?: string;
    roomFeatures?: string;
    features?: string;
    price?: string;
}

export enum QueryStringFilterEnum {
    BEACH_TYPE = 'beachType',
    BEACH_DISTANCE = 'beachDistance',
    EAT = 'eat',
    ROOM_TYPE = 'roomType',
    ROOM_FEATURES = 'roomFeatures',
    FEATURES = 'features',
    PRICE = 'price',
}
