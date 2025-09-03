'use client';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import cx from 'classnames';
import { Filter, X } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { INITIAL_FILTERS } from '../lib/constants';
import { AdvancedFiltersState } from '../lib/types';
import { FilterSection } from './FilterSection';

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
    triggerText = 'Фильтры',
    className,
    onFiltersChange,
}) => {
    const [filters, setFilters] = useState<AdvancedFiltersState>(INITIAL_FILTERS);
    const [isOpen, setIsOpen] = useState(false);

    const handleOptionToggle = useCallback((sectionId: string, optionId: string) => {
        setFilters((prevFilters) => {
            const newFilters = { ...prevFilters };

            // Находим секцию в hotel или room
            if (newFilters.hotel[sectionId as keyof typeof newFilters.hotel]) {
                const section = newFilters.hotel[sectionId as keyof typeof newFilters.hotel];
                if (section) {
                    const option = section.options.find((opt) => opt.id === optionId);
                    if (option) {
                        option.isActive = !option.isActive;
                    }
                }
            } else if (newFilters.room[sectionId as keyof typeof newFilters.room]) {
                const section = newFilters.room[sectionId as keyof typeof newFilters.room];
                if (section) {
                    const option = section.options.find((opt) => opt.id === optionId);
                    if (option) {
                        option.isActive = !option.isActive;
                    }
                }
            }

            return newFilters;
        });
    }, []);

    const handleApplyFilters = useCallback(() => {
        onFiltersChange?.(filters);
        setIsOpen(false);
    }, [filters, onFiltersChange]);

    const handleResetFilters = useCallback(() => {
        setFilters(INITIAL_FILTERS);
    }, []);

    const handleOpenChange = useCallback((open: boolean) => {
        setIsOpen(open);
        if (!open) {
            // При закрытии сбрасываем фильтры к исходному состоянию
            setFilters(INITIAL_FILTERS);
        }
    }, []);

    const getActiveFiltersCount = useCallback(() => {
        let count = 0;
        Object.values(filters.hotel).forEach((section) => {
            count += section.options.filter((option) => option.isActive).length;
        });
        Object.values(filters.room).forEach((section) => {
            count += section.options.filter((option) => option.isActive).length;
        });
        return count;
    }, [filters]);

    const activeFiltersCount = getActiveFiltersCount();

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className={cx(
                        'relative',
                        activeFiltersCount > 0 && 'border-primary bg-primary/5',
                        className,
                    )}
                >
                    <Filter size={16} className="mr-2" />
                    {triggerText}
                    {activeFiltersCount > 0 && (
                        <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                            {activeFiltersCount}
                        </span>
                    )}
                </Button>
            </DialogTrigger>

            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="flex flex-row items-center justify-between">
                    <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsOpen(false)}
                        className="h-8 w-8 p-0"
                    >
                        <X size={16} />
                    </Button>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Фильтры по отелю */}
                    <div>
                        <h3 className="text-lg font-medium text-foreground mb-4 border-b pb-2">
                            Фильтры по отелю
                        </h3>
                        <div className="space-y-2">
                            <FilterSection
                                section={filters.hotel.city}
                                onOptionToggle={handleOptionToggle}
                            />
                        </div>
                    </div>

                    {/* Фильтры по номеру */}
                    <div>
                        <h3 className="text-lg font-medium text-foreground mb-4 border-b pb-2">
                            Фильтры по номеру
                        </h3>
                        <div className="space-y-2">
                            <FilterSection
                                section={filters.room.features}
                                onOptionToggle={handleOptionToggle}
                            />
                            <FilterSection
                                section={filters.room.accommodation}
                                onOptionToggle={handleOptionToggle}
                            />
                            <FilterSection
                                section={filters.room.nutrition}
                                onOptionToggle={handleOptionToggle}
                            />
                            <FilterSection
                                section={filters.room.beach}
                                onOptionToggle={handleOptionToggle}
                            />
                            <FilterSection
                                section={filters.room.beachDistance}
                                onOptionToggle={handleOptionToggle}
                            />
                            <FilterSection
                                section={filters.room.price}
                                onOptionToggle={handleOptionToggle}
                            />
                        </div>
                    </div>
                </div>

                {/* Кнопки действий */}
                <div className="flex items-center justify-between pt-4 border-t">
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
                </div>
            </DialogContent>
        </Dialog>
    );
};

