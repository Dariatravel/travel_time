import { AdvancedFiltersState } from './types';

/**
 * Вернуть количество активных опций по всему дереву
 */
export const countActiveFilters = (state: AdvancedFiltersState): number => {
    let count = 0;
    Object.values(state.hotel).forEach((section) => {
        count += section.options.filter((o) => o.isActive).length;
    });
    Object.values(state.room).forEach((section) => {
        count += section.options.filter((o) => o.isActive).length;
    });
    return count;
};
