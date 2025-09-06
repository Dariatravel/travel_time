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

export interface AdvancedFiltersState {
    /** Город */
    city: FilterSection;
    /** Особенности номера */
    roomFeatures: FilterSection;
    /** Особенности размещения */
    features: FilterSection;
    /** Питание */
    eat: FilterSection;
    /** Тип пляжа */
    beach: FilterSection;
    /** Расстояние до пляжа */
    beachDistance: FilterSection;
    /** Ценовой диапазон */
    price: FilterSection;
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
    [key: string]: string | undefined;
    beachType?: string;
    beachDistance?: string;
    eat?: string;
    roomType?: string;
    roomFeatures?: string;
    features?: string;
    price?: string;
}

export enum QueryStringFilterEnum {
    CITY = 'city',
    BEACH_TYPE = 'beachType',
    BEACH_DISTANCE = 'beachDistance',
    EAT = 'eat',
    ROOM_TYPE = 'roomType',
    ROOM_FEATURES = 'roomFeatures',
    FEATURES = 'features',
    PRICE = 'price',
}
