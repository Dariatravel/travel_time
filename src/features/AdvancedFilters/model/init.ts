import { INITIAL_FILTERS } from '../lib/constants';
import { AdvancedFiltersState, FilterSection, QueryStringFilterEnum } from '../lib/types';
import { filtersHydrated } from './events';
import { $filters } from './stores';

/**
 * Маппинг ключей query string → идентификаторы секций в состоянии
 * Ключи, отсутствующие в схеме, игнорируются
 */
export const FILTER_MAP: Record<QueryStringFilterEnum, QueryStringFilterEnum> = {
    [QueryStringFilterEnum.CITY]: QueryStringFilterEnum.CITY,
    [QueryStringFilterEnum.BEACH_TYPE]: QueryStringFilterEnum.BEACH_TYPE,
    [QueryStringFilterEnum.BEACH_DISTANCE]: QueryStringFilterEnum.BEACH_DISTANCE,
    [QueryStringFilterEnum.EAT]: QueryStringFilterEnum.EAT,
    [QueryStringFilterEnum.PRICE]: QueryStringFilterEnum.PRICE,
    [QueryStringFilterEnum.FEATURES]: QueryStringFilterEnum.FEATURES,
    [QueryStringFilterEnum.ROOM_FEATURES]: QueryStringFilterEnum.ROOM_FEATURES,
    [QueryStringFilterEnum.ROOM_TYPE]: QueryStringFilterEnum.ROOM_TYPE,
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
        const sectionId = FILTER_MAP[rawKey as QueryStringFilterEnum];
        if (!sectionId) continue;
        if (!rawValue) continue;
        const values = rawValue
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);

        const section = next[sectionId as keyof AdvancedFiltersState] as FilterSection | undefined;
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

    const pushSection = (queryKey: string, section?: FilterSection) => {
        if (!section) return;
        const active = section.options.filter((o) => o.isActive).map((o) => o.value);
        if (active.length === 0) return;
        result[queryKey] = active.join(',');
    };

    (Object.entries(FILTER_MAP) as Array<[keyof AdvancedFiltersState, string]>).forEach(
        ([sectionId, queryKey]) => {
            const section = state[sectionId];
            pushSection(queryKey, section);
        },
    );

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
