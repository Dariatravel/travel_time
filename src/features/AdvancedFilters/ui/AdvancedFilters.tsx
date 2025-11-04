'use client';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import cx from 'classnames';
import { useUnit } from 'effector-react';
import { Filter } from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';
import { AdvancedFiltersState } from '../lib/types';
import * as AdvancedFiltersModel from '../model';
import { FilterSection } from './FilterSection';
import { FiltersSync } from './FiltersSync';

interface AdvancedFiltersProps {
    /** Заголовок модального окна */
    title?: string;
    /** Текст кнопки открытия */
    triggerText?: string;
    /** Дополнительные CSS классы */
    className?: string;
    /** Обработчик изменения фильтров */
    onFiltersChange?: (filters: AdvancedFiltersState) => void;
}

/**
 * Компонент расширенной фильтрации для поиска номеров отелей
 * Предоставляет модальное окно с различными категориями фильтров
 */
export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
    title = 'Расширенные фильтры',
    triggerText,
    className,
    onFiltersChange,
}) => {
    const filters = useUnit(AdvancedFiltersModel.$filters);
    const [isOpen, setIsOpen] = useState(false);
    const isApplyingRef = useRef(false);

    const handleOptionToggle = useCallback(
        (sectionId: string, optionId: string) => {
            const section = filters[sectionId as keyof AdvancedFiltersState];
            const current = section?.options.find((o) => o.id === optionId)?.isActive ?? false;
            AdvancedFiltersModel.filterSet({ sectionId, optionId, isActive: !current });
        },
        [filters],
    );

    const handleApplyFilters = useCallback(() => {
        if (isApplyingRef.current) return; // Предотвращаем повторный вызов
        isApplyingRef.current = true;

        // Вызываем onFiltersChange перед закрытием модального окна
        // чтобы гарантировать применение актуальных фильтров
        const currentFilters = filters as AdvancedFiltersState;
        onFiltersChange?.(currentFilters);
        // Закрываем модальное окно после применения фильтров
        setIsOpen(false);

        // Сбрасываем флаг через небольшую задержку
        setTimeout(() => {
            isApplyingRef.current = false;
        }, 300);
    }, [filters, onFiltersChange]);

    const handleResetFilters = useCallback(() => {
        // Сброс к исходным значениям (дефолты из INITIAL)
        // Сначала очищаем фильтры, затем гидратируем начальное состояние
        AdvancedFiltersModel.filtersCleared();
        // Не вызываем filtersHydrated сразу, чтобы избежать конфликтов с FiltersSync
        // FiltersSync автоматически обновит URL при изменении фильтров
    }, []);

    const handleOpenChange = useCallback((open: boolean) => {
        // Предотвращаем открытие, если идёт применение фильтров
        if (isApplyingRef.current && open) return;

        setIsOpen(open);
        // Не сбрасываем фильтры при закрытии, чтобы сохранить примененные фильтры
        // Фильтры сбрасываются только явно через кнопку "Сбросить фильтры"
        // Если закрываем модальное окно, не вызываем никаких дополнительных действий
    }, []);

    const getActiveFiltersCount = useCallback(() => {
        let count = 0;
        (Object.values(filters) as Array<AdvancedFiltersState[keyof AdvancedFiltersState]>).forEach(
            (section) => {
                count += section.options.filter((option) => option.isActive).length;
            },
        );
        return count;
    }, [filters]);

    const activeFiltersCount = getActiveFiltersCount();

    return (
        <>
            {/* Невидимая синхронизация с URL */}
            <FiltersSync />
            <Dialog open={isOpen} onOpenChange={handleOpenChange}>
                <DialogTrigger asChild>
                    <Button
                        variant="outline"
                        className={cx(
                            'relative',
                            activeFiltersCount > 0 && 'border-primary bg-primary/5 cursor-pointer',
                            className,
                        )}
                    >
                        <Filter size={16} />
                        {activeFiltersCount > 0 && (
                            <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                {activeFiltersCount}
                            </span>
                        )}
                    </Button>
                </DialogTrigger>

                <DialogContent className="max-w-6xl overflow-y-auto sm:max-w-4xl">
                    <DialogHeader className="flex flex-row items-center justify-between">
                        <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
                    </DialogHeader>
                    <DialogDescription className="max-h-[70vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-2">
                            <FilterSection
                                section={filters.city}
                                onOptionToggle={handleOptionToggle}
                            />
                            <FilterSection
                                section={filters.beach}
                                onOptionToggle={handleOptionToggle}
                            />
                            <FilterSection
                                section={filters.roomFeatures}
                                onOptionToggle={handleOptionToggle}
                            />
                            <FilterSection
                                section={filters.features}
                                onOptionToggle={handleOptionToggle}
                            />
                            <FilterSection
                                section={filters.beachDistance}
                                onOptionToggle={handleOptionToggle}
                            />
                            <FilterSection
                                section={filters.eat}
                                onOptionToggle={handleOptionToggle}
                            />
                            <FilterSection
                                section={filters.price}
                                onOptionToggle={handleOptionToggle}
                            />
                        </div>
                        {/* </div> */}
                    </DialogDescription>

                    {/* Кнопки действий */}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={handleResetFilters}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            Сбросить фильтры
                        </Button>

                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => setIsOpen(false)}>
                                Отмена
                            </Button>
                            <Button onClick={handleApplyFilters}>Применить фильтры</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
