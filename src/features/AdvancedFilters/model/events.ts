import { createEvent } from 'effector';
import { AdvancedFiltersState } from '../lib/types';

/**
 * События управления фильтрами (effector)
 * Все комментарии на русском языке, UI не затрагивается
 */

/** Установить состояние одного фильтра (по секции и опции) */
export interface SetSingleFilterPayload {
    /** Идентификатор секции (напр. "features", "beach") */
    sectionId: string;
    /** Идентификатор опции (напр. "sea-view") */
    optionId: string;
    /** Явная установка состояния активности */
    isActive: boolean;
}

/** Массовая установка части состояния фильтров */
export interface SetBulkFiltersPayload {
    /** Частичное состояние, будет слито поверх текущего */
    partial: Partial<AdvancedFiltersState>;
}

/** Установить один фильтр (по секции и опции) */
export const filterSet = createEvent<SetSingleFilterPayload>();

/** Удалить (деактивировать) один фильтр по секции */
export const filterRemoved = createEvent<{ sectionId: string; optionId: string }>();

/** Очистить все активные фильтры */
export const filtersCleared = createEvent();

/** Массовая установка фильтров (часть состояния) */
export const filtersSetBulk = createEvent<SetBulkFiltersPayload>();

/** Гидратация состояния из query string */
export const filtersHydrated = createEvent<AdvancedFiltersState>();
