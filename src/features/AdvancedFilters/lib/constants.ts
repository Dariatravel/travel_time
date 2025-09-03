import { AdvancedFiltersState } from './types';

/**
 * Константы для расширенной фильтрации
 */

export const INITIAL_FILTERS: AdvancedFiltersState = {
    hotel: {
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
    },
    room: {
        features: {
            id: 'features',
            title: 'Особенности номера',
            options: [
                { id: 'sea-view', label: 'Вид на море', value: 'sea-view', isActive: false },
                { id: 'balcony', label: 'Балкон', value: 'balcony', isActive: false },
                { id: 'pool', label: 'Бассейн', value: 'pool', isActive: false },
                {
                    id: 'single-room',
                    label: 'Однокомнатный',
                    value: 'single-room',
                    isActive: false,
                },
                {
                    id: 'double-room',
                    label: 'Двухкомнатный',
                    value: 'double-room',
                    isActive: false,
                },
                { id: 'kitchen', label: 'Своя кухня', value: 'kitchen', isActive: false },
                {
                    id: 'air-conditioning',
                    label: 'Кондиционер',
                    value: 'air-conditioning',
                    isActive: false,
                },
            ],
            isExpanded: false,
        },
        accommodation: {
            id: 'accommodation',
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
            isExpanded: false,
        },
        nutrition: {
            id: 'nutrition',
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
            isExpanded: false,
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
                {
                    id: 'pebble-sand',
                    label: 'Галечно-песочный',
                    value: 'pebble-sand',
                    isActive: false,
                },
            ],
            isExpanded: false,
        },
        beachDistance: {
            id: 'beachDistance',
            title: 'Расстояние до пляжа',
            options: [
                {
                    id: 'coastal-zone',
                    label: 'Береговая зона',
                    value: 'coastal-zone',
                    isActive: false,
                },
                { id: '5-min', label: 'До 5 минут', value: '5-min', isActive: false },
                { id: '10-min', label: 'До 10 минут', value: '10-min', isActive: false },
                {
                    id: 'more-10-min',
                    label: 'Более 10 минут',
                    value: 'more-10-min',
                    isActive: false,
                },
            ],
            isExpanded: false,
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
                {
                    id: 'up-to-10000',
                    label: 'До 10000 руб.',
                    value: 'up-to-10000',
                    isActive: false,
                },
                {
                    id: 'over-10000',
                    label: 'Свыше 10000 руб.',
                    value: 'over-10000',
                    isActive: false,
                },
            ],
            isExpanded: false,
        },
    },
};
