import { AdvancedFiltersState, FilterSection } from './types';

/**
 * Вспомогательная функция: деактивировать все опции секции
 */
export const deactivateSection = (section?: FilterSection) => {
    if (!section) return;
    section.options.forEach((o) => (o.isActive = false));
};

/**
 * Проверить, есть ли активные опции в секции
 */
export const hasActiveOptions = (section?: FilterSection) => {
    if (!section) return false;
    return section.options.some((o) => o.isActive);
};

/**
 * Глубокое клонирование состояния фильтров. Используем structuredClone если доступен.
 */
export const cloneFiltersState = (state: AdvancedFiltersState): AdvancedFiltersState => {
    return structuredClone(state);
};
