import { createStore } from 'effector';
import { INITIAL_FILTERS } from '../lib/constants';
import { AdvancedFiltersState } from '../lib/types';
import {
    filterRemoved,
    filtersCleared,
    filterSet,
    filtersHydrated,
    filtersSetBulk,
} from './events';

/**
 * Главный стор фильтров. Содержит все секции и опции с признаками активности.
 */
export const $filters = createStore<AdvancedFiltersState>(INITIAL_FILTERS);

/** Флаг предотвращения циклов синхронизации при гидратации из URL */
export const $isHydratingFromQuery = createStore<boolean>(false);

/**
 * Производные сторы: отдельные представления для фильтров отеля и номеров
 */
// Единый стор `$filters` — производные сторы удалены по требованиям

// helper not used — удалён для чистоты

/**
 * Редьюсер: установка одного фильтра
 */
$filters.on(filterSet, (state, { sectionId, optionId, isActive }) => {
    const newState: AdvancedFiltersState = structuredClone(state);
    const section = newState[sectionId as keyof AdvancedFiltersState] as
        | AdvancedFiltersState[keyof AdvancedFiltersState]
        | undefined;
    if (!section) return state;
    const option = section.options.find((o) => o.id === optionId);
    if (!option) return state;
    option.isActive = isActive;
    return newState;
});

/**
 * Редьюсер: удаление/деактивация одного фильтра
 */
$filters.on(filterRemoved, (state, { sectionId, optionId }) => {
    const newState: AdvancedFiltersState = structuredClone(state);
    const section = newState[sectionId as keyof AdvancedFiltersState] as
        | AdvancedFiltersState[keyof AdvancedFiltersState]
        | undefined;
    if (!section) return state;
    const option = section.options.find((o) => o.id === optionId);
    if (!option) return state;
    option.isActive = false;
    return newState;
});

/**
 * Редьюсер: очистка всех фильтров
 */
$filters.on(filtersCleared, (state) => {
    const newState: AdvancedFiltersState = structuredClone(state);
    (Object.values(newState) as Array<AdvancedFiltersState[keyof AdvancedFiltersState]>).forEach(
        (section) => {
            section.options.forEach((o) => (o.isActive = false));
        },
    );
    return newState;
});

/**
 * Редьюсер: установка части состояния (пачкой)
 */
$filters.on(filtersSetBulk, (state, { partial }) => {
    const newState: AdvancedFiltersState = structuredClone(state);
    return Object.assign(newState, partial);
});

/**
 * Редьюсер: гидратация целиком из URL
 */
$filters.on(filtersHydrated, (_, payload) => payload);

/**
 * Флаг гидратации: true на время гидратации, false по окончании
 */
$isHydratingFromQuery
    .on(filtersHydrated, () => false)
    .reset(filtersCleared)
    .on(filtersSetBulk, () => false);
