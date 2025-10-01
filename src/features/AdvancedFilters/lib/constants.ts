import { AdvancedFiltersState } from './types';

/**
 * Константы для расширенной фильтрации
 */
export const DEFAULT_CITIES = [
    { value: 'sukhumi', label: 'Сухум' },
    { value: 'gagra', label: 'Гагра' },
    { value: 'gali', label: 'Гали' },
    { value: 'pitsunda', label: 'Пицунда' },
    { value: 'new-athon', label: 'Новый Афон' },
];

export const DEFAULT_ROOM_FEATURES = [
    { value: 'sea-view', label: 'Вид на море' },
    { value: 'balcony', label: 'Балкон' },
    { value: 'pool', label: 'Бассейн' },
    { value: 'single-room', label: 'Однокомнатный' },
    { value: 'double-room', label: 'Двухкомнатный' },
];

export const DEFAULT_FEATURES = [
    { value: 'children-allowed', label: 'Можно с детьми' },
    { value: 'pets-allowed', label: 'Можно с животными' },
];

export const DEFAULT_EAT = [
    { value: 'breakfast', label: 'Завтрак' },
    { value: 'half-board', label: 'Полупансион' },
    { value: 'full-board', label: 'Завтрак, обед, ужин' },
    { value: 'cafe', label: 'Есть кафе/столовая' },
    { value: 'no-meals', label: 'Без питания' },
];

export const DEFAULT_BEACH = [
    { value: 'pebble', label: 'Галечный' },
    { value: 'pine-pebble', label: 'Сосновый галечный' },
    { value: 'sand', label: 'Песчаный' },
    { value: 'pebble-sand', label: 'Галечно-песочный' },
];

export const DEFAULT_BEACH_DISTANCE = [
    { value: 'coastal-zone', label: 'Береговая зона' },
    { value: '5-min', label: 'До 5 минут' },
    { value: '10-min', label: 'До 10 минут' },
    { value: 'more-10-min', label: 'Более 10 минут' },
];

export const DEFAULT_PRICE = [
    { value: 'up-to-3000', label: 'До 3000 руб.' },
    { value: 'up-to-4000', label: 'До 4000 руб.' },
    { value: 'up-to-5000', label: 'До 5000 руб.' },
    { value: 'up-to-6000', label: 'До 6000 руб.' },
    { value: 'up-to-7000', label: 'До 7000 руб.' },
];

export const TRAVEL_TIME_DEFAULTS = {
    city: DEFAULT_CITIES,
    room_features: DEFAULT_ROOM_FEATURES,
    features: DEFAULT_FEATURES,
    eat: DEFAULT_EAT,
    beach: DEFAULT_BEACH,
    beach_distance: DEFAULT_BEACH_DISTANCE,
    price: DEFAULT_PRICE,
};

/**
 * Функции для маппинга значений в русские названия
 */
export const getCityLabel = (value: string): string => {
    const city = INITIAL_FILTERS.city.options.find((option) => option.value === value);
    return city?.label || value;
};

export const getFeatureLabel = (value: string): string => {
    const feature =
        INITIAL_FILTERS.features.options.find((option) => option.value === value) ||
        INITIAL_FILTERS.roomFeatures.options.find((option) => option.value === value) ||
        INITIAL_FILTERS.eat.options.find((option) => option.value === value) ||
        INITIAL_FILTERS.beach.options.find((option) => option.value === value) ||
        INITIAL_FILTERS.beachDistance.options.find((option) => option.value === value) ||
        INITIAL_FILTERS.price.options.find((option) => option.value === value);
    return feature?.label || value;
};

/**
 * Маппинг для быстрого поиска русских названий
 */
export const VALUE_TO_LABEL_MAP = {
    // Города
    sukhumi: 'Сухум',
    gagra: 'Гагра',
    gali: 'Гали',
    pitsunda: 'Пицунда',
    'new-athon': 'Новый Афон',

    // Особенности номера
    'sea-view': 'Вид на море',
    balcony: 'Балкон',
    pool: 'Бассейн',
    'single-room': 'Однокомнатный',
    'double-room': 'Двухкомнатный',
    kitchen: 'Своя кухня',
    'air-conditioning': 'Кондиционер',
    // wifi: 'Wi-Fi',
    // minibar: 'Мини-бар',
    // tv: 'Телевизор',
    // jacuzzi: 'Джакузи',
    // kitchenette: 'Кухонный уголок',
    // safe: 'Сейф',
    // refrigerator: 'Холодильник',
    // 'washing-machine': 'Стиральная машина',
    // iron: 'Утюг',
    // 'hair-dryer': 'Фен',
    // towels: 'Полотенца',
    // linen: 'Постельное белье',

    // Особенности размещения
    'children-allowed': 'Можно с детьми',
    'pets-allowed': 'Можно с животными',

    // Питание
    breakfast: 'Завтрак',
    'half-board': 'Полупансион',
    'full-board': 'Завтрак, обед, ужин',
    cafe: 'Есть кафе/столовая',
    'no-meals': 'Без питания',

    // Пляж
    pebble: 'Галечный',
    'pine-pebble': 'Сосновый галечный',
    sand: 'Песчаный',
    'pebble-sand': 'Галечно-песочный',

    // Расстояние до пляжа
    'coastal-zone': 'Береговая зона',
    '5-min': 'До 5 минут',
    '10-min': 'До 10 минут',
    'more-10-min': 'Более 10 минут',

    // Цена
    'up-to-3000': 'До 3000 руб.',
    'up-to-4000': 'До 4000 руб.',
    'up-to-5000': 'До 5000 руб.',
    'up-to-6000': 'До 6000 руб.',
    'up-to-7000': 'До 7000 руб.',
    'up-to-8000': 'До 8000 руб.',
    'up-to-9000': 'До 9000 руб.',
    'up-to-10000': 'До 10000 руб.',
    'over-10000': 'Свыше 10000 руб.',
} as const;

/**
 * Функция для получения русского названия по значению
 */
export const getValueLabel = (value: string): string => {
    return VALUE_TO_LABEL_MAP[value as keyof typeof VALUE_TO_LABEL_MAP] || value;
};

export const INITIAL_FILTERS: AdvancedFiltersState = {
    city: {
        id: 'city',
        title: 'Город',
        options: [
            { id: 'sukhumi', label: 'Сухум', value: 'sukhumi', isActive: true },
            { id: 'gagra', label: 'Гагра', value: 'gagra', isActive: false },
            { id: 'gali', label: 'Гали', value: 'gali', isActive: false },
            { id: 'pitsunda', label: 'Пицунда', value: 'pitsunda', isActive: false },
            { id: 'new-athon', label: 'Новый Афон', value: 'new-athon', isActive: false },
        ],
        isExpanded: true,
    },
    roomFeatures: {
        id: 'roomFeatures',
        title: 'Особенности номера',
        options: [
            { id: 'sea-view', label: 'Вид на море', value: 'sea-view', isActive: false },
            { id: 'balcony', label: 'Балкон', value: 'balcony', isActive: false },
            { id: 'pool', label: 'Бассейн', value: 'pool', isActive: false },
            { id: 'single-room', label: 'Однокомнатный', value: 'single-room', isActive: false },
            { id: 'double-room', label: 'Двухкомнатный', value: 'double-room', isActive: false },
            { id: 'kitchen', label: 'Своя кухня', value: 'kitchen', isActive: false },
            {
                id: 'air-conditioning',
                label: 'Кондиционер',
                value: 'air-conditioning',
                isActive: false,
            },
        ],
        isExpanded: true,
    },
    features: {
        id: 'features',
        title: 'Особенности размещения',
        options: [
            {
                id: 'children-allowed',
                label: 'Можно с детьми',
                value: 'children-allowed',
                isActive: false,
            },
            {
                id: 'pets-allowed',
                label: 'Можно с животными',
                value: 'pets-allowed',
                isActive: false,
            },
        ],
        isExpanded: true,
    },
    eat: {
        id: 'eat',
        title: 'Питание',
        options: [
            { id: 'breakfast', label: 'Завтрак', value: 'breakfast', isActive: false },
            { id: 'half-board', label: 'Полупансион', value: 'half-board', isActive: false },
            {
                id: 'full-board',
                label: 'Завтрак, обед, ужин',
                value: 'full-board',
                isActive: false,
            },
            { id: 'cafe', label: 'Есть кафе/столовая', value: 'cafe', isActive: false },
            { id: 'no-meals', label: 'Без питания', value: 'no-meals', isActive: false },
        ],
        isExpanded: true,
    },
    beach: {
        id: 'beach',
        title: 'Пляж',
        options: [
            { id: 'pebble', label: 'Галечный', value: 'pebble', isActive: false },
            {
                id: 'pine-pebble',
                label: 'Сосновый галечный',
                value: 'pine-pebble',
                isActive: false,
            },
            { id: 'sand', label: 'Песчаный', value: 'sand', isActive: false },
            { id: 'pebble-sand', label: 'Галечно-песочный', value: 'pebble-sand', isActive: false },
        ],
        isExpanded: true,
    },
    beachDistance: {
        id: 'beachDistance',
        title: 'Расстояние до пляжа',
        options: [
            { id: 'coastal-zone', label: 'Береговая зона', value: 'coastal-zone', isActive: false },
            { id: '5-min', label: 'До 5 минут', value: '5-min', isActive: false },
            { id: '10-min', label: 'До 10 минут', value: '10-min', isActive: false },
            { id: 'more-10-min', label: 'Более 10 минут', value: 'more-10-min', isActive: false },
        ],
        isExpanded: true,
    },
    price: {
        id: 'price',
        title: 'Цена',
        options: [
            { id: 'up-to-3000', label: 'До 3000 руб.', value: 'up-to-3000', isActive: false },
            { id: 'up-to-4000', label: 'До 4000 руб.', value: 'up-to-4000', isActive: false },
            { id: 'up-to-5000', label: 'До 5000 руб.', value: 'up-to-5000', isActive: false },
            { id: 'up-to-6000', label: 'До 6000 руб.', value: 'up-to-6000', isActive: false },
            { id: 'up-to-7000', label: 'До 7000 руб.', value: 'up-to-7000', isActive: false },
            { id: 'up-to-8000', label: 'До 8000 руб.', value: 'up-to-8000', isActive: false },
            { id: 'up-to-9000', label: 'До 9000 руб.', value: 'up-to-9000', isActive: false },
            { id: 'up-to-10000', label: 'До 10000 руб.', value: 'up-to-10000', isActive: false },
            { id: 'over-10000', label: 'Свыше 10000 руб.', value: 'over-10000', isActive: false },
        ],
        isExpanded: true,
    },
};

export const INITIAL_ROOM_FEATURES = INITIAL_FILTERS.roomFeatures.options;
