import { INITIAL_FILTERS } from '../lib/constants';
import { AdvancedFiltersState, FilterSection, QueryStringFilterEnum } from '../lib/types';
import { filtersHydrated } from './events';
import { $filters } from './stores';

/**
 * Маппинг ключей URL query string → ключи состояния AdvancedFiltersState
 */
const URL_TO_STATE_MAP: Record<string, keyof AdvancedFiltersState> = {
    [QueryStringFilterEnum.CITY]: 'city',
    [QueryStringFilterEnum.BEACH_TYPE]: 'beach',
    [QueryStringFilterEnum.BEACH_DISTANCE]: 'beachDistance',
    [QueryStringFilterEnum.EAT]: 'eat',
    [QueryStringFilterEnum.PRICE]: 'price',
    [QueryStringFilterEnum.FEATURES]: 'features',
    [QueryStringFilterEnum.ROOM_FEATURES]: 'roomFeatures',
    [QueryStringFilterEnum.ROOM_TYPE]: 'roomFeatures', // roomType тоже относится к roomFeatures
};

/**
 * Маппинг ключей состояния AdvancedFiltersState → ключи URL query string
 */
const STATE_TO_URL_MAP: Record<keyof AdvancedFiltersState, string> = {
    city: QueryStringFilterEnum.CITY,
    beach: QueryStringFilterEnum.BEACH_TYPE,
    beachDistance: QueryStringFilterEnum.BEACH_DISTANCE,
    eat: QueryStringFilterEnum.EAT,
    price: QueryStringFilterEnum.PRICE,
    features: QueryStringFilterEnum.FEATURES,
    roomFeatures: QueryStringFilterEnum.ROOM_FEATURES,
};

/**
 * Распарсить URLSearchParams в состояние фильтров
 * Значения поддерживают множественный выбор через запятую
 */
export const parseFiltersFromSearchParams = (
    searchParams: URLSearchParams,
    base: AdvancedFiltersState = INITIAL_FILTERS,
): AdvancedFiltersState => {
    const next: AdvancedFiltersState = structuredClone(base);

    // Сначала деактивируем всё
    (Object.values(next) as Array<AdvancedFiltersState[keyof AdvancedFiltersState]>).forEach(
        (section) => section.options.forEach((o) => (o.isActive = false)),
    );

    for (const [rawKey, rawValue] of searchParams.entries()) {
        const stateKey = URL_TO_STATE_MAP[rawKey];
        if (!stateKey) continue;
        if (!rawValue) continue;
        const values = rawValue
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);

        const section = next[stateKey] as FilterSection | undefined;
        if (!section) continue;

        section.options.forEach((opt) => {
            opt.isActive = values.includes(opt.value);
        });
    }

    return next;
};

/**
 * Сериализация состояния фильтров в объект для формирования query string
 * Пустые секции не попадают в строку запроса
 */
export const serializeFiltersToQuery = (state: AdvancedFiltersState): Record<string, string> => {
    const result: Record<string, string> = {};

    (Object.entries(state) as Array<[keyof AdvancedFiltersState, FilterSection]>).forEach(
        ([stateKey, section]) => {
            const queryKey = STATE_TO_URL_MAP[stateKey];
            if (!queryKey) {
                console.warn(`serializeFiltersToQuery: no mapping for stateKey: ${stateKey}`);
                return;
            }

            const active = section.options.filter((o) => o.isActive).map((o) => o.value);

            console.log(`serializeFiltersToQuery: ${stateKey} -> ${queryKey}, active:`, active);

            if (active.length === 0) return;

            result[queryKey] = active.join(',');
        },
    );

    console.log('serializeFiltersToQuery: final result:', result);
    return result;
};

/**
 * Инициализация состояния фильтров из текущего URL
 * Вызывается однократно на клиенте перед использованием фильтров
 */
export const initFiltersFromQuery = (searchParams?: URLSearchParams) => {
    const sp =
        searchParams ??
        (typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search)
            : new URLSearchParams());
    const next = parseFiltersFromSearchParams(sp, $filters.getState());
    filtersHydrated(next);
};
