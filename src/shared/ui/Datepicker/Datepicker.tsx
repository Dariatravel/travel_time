'use client';

import { ChevronDownIcon, XIcon } from 'lucide-react';
import { type DateRange } from 'react-day-picker';
import { ru } from 'react-day-picker/locale';
import React, { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Drawer,
    DrawerContent,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useScreenSize } from '@/shared/lib/useScreenSize';

/**
 * Форматирует одну дату на русском языке
 */
const formatDateRu = (date: Date): string => {
    const options: Intl.DateTimeFormatOptions = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    };

    return date.toLocaleDateString('ru-RU', options);
};

/**
 * Форматирует диапазон дат на русском языке
 */
const formatDateRangeRu = (from: Date, to: Date): string => {
    const fromFormatted = formatDateRu(from);
    const toFormatted = formatDateRu(to);

    return `${fromFormatted} - ${toFormatted}`;
};

/**
 * Получает текст для отображения в кнопке выбора даты
 */
const getDateButtonText = (selected: DateRange | undefined): string => {
    if (selected?.from && selected?.to) {
        return formatDateRangeRu(selected.from, selected.to);
    }

    if (selected?.from) {
        return formatDateRu(selected.from);
    }

    return 'Выберите даты';
};

export interface DatepickerProps {
    selected: DateRange | undefined;
    onSelect: (range: DateRange | undefined) => void;
    label: string;
    numberOfMonths?: number;
    defaultMonth?: Date; // Месяц, на котором открывается календарь
}

export const Datepicker = ({
    selected,
    onSelect,
    label,
    numberOfMonths = 1,
    defaultMonth,
}: DatepickerProps) => {
    const { isPhone } = useScreenSize();
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [draftSelected, setDraftSelected] = useState<DateRange | undefined>(selected);
    // Используем управляемый месяц для правильного отображения при открытии
    const [month, setMonth] = useState<Date | undefined>(
        defaultMonth || selected?.from || new Date(),
    );

    // Обновляем месяц при изменении selected или defaultMonth
    useEffect(() => {
        if (selected?.from) {
            setMonth(selected.from);
        } else if (defaultMonth) {
            setMonth(defaultMonth);
        }
    }, [selected?.from, defaultMonth]);

    useEffect(() => {
        if (!isDrawerOpen) {
            setDraftSelected(selected);
        }
    }, [isDrawerOpen, selected]);

    /**
     * Обработчик очистки выбранной даты
     */
    const clearSelection = () => {
        setDraftSelected(undefined);
        onSelect(undefined);
    };

    const handleClear = (e: React.MouseEvent | React.KeyboardEvent) => {
        e.preventDefault();
        clearSelection();
        e.stopPropagation();
    };

    const hasSelectedDate = selected?.from;
    const mobileSelected = isDrawerOpen ? draftSelected : selected;

    const triggerButton = (
        <Button
            variant="outline"
            id="dates"
            className={cn('relative h-10 w-full justify-between overflow-hidden font-normal text-base', {
                ['text-muted-foreground']: !hasSelectedDate,
            })}
        >
            <span className="block min-w-0 truncate pr-12 text-left">
                {getDateButtonText(selected)}
            </span>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0">
                {hasSelectedDate && (
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={handleClear}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                handleClear(event);
                            }
                        }}
                        className="hover:bg-gray-200 rounded p-1 transition-colors"
                        aria-label="Очистить дату"
                    >
                        <XIcon className="h-4 w-4" />
                    </span>
                )}
                <ChevronDownIcon className="h-4 w-4" />
            </div>
        </Button>
    );

    return (
        <div className="w-full">
            <Label className="text-sm block">{label}</Label>
            {isPhone ? (
                <Drawer
                    open={isDrawerOpen}
                    onOpenChange={setIsDrawerOpen}
                    shouldScaleBackground={false}
                    modal
                >
                    <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
                    <DrawerContent className="max-h-[92dvh] pb-[env(safe-area-inset-bottom)]">
                        <DrawerHeader>
                            <DrawerTitle>{label}</DrawerTitle>
                        </DrawerHeader>
                        <div className="px-4">
                            <Calendar
                                locale={ru}
                                mode="range"
                                numberOfMonths={1}
                                selected={mobileSelected}
                                onSelect={setDraftSelected}
                                month={month}
                                onMonthChange={setMonth}
                                className="mx-auto w-full max-w-sm [--cell-size:--spacing(10)]"
                                classNames={{
                                    root: 'w-full',
                                    months: 'flex flex-col gap-4',
                                    month: 'w-full',
                                }}
                                formatters={{
                                    formatMonthDropdown: (date) =>
                                        date.toLocaleString('ru', { month: 'short' }),
                                }}
                            />
                        </div>
                        <DrawerFooter>
                            <Button
                                onClick={() => {
                                    onSelect(draftSelected);
                                    setIsDrawerOpen(false);
                                }}
                            >
                                Готово
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    clearSelection();
                                    setIsDrawerOpen(false);
                                }}
                            >
                                Очистить
                            </Button>
                        </DrawerFooter>
                    </DrawerContent>
                </Drawer>
            ) : (
                <Popover>
                    <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
                    <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                        <Calendar
                            locale={ru}
                            mode="range"
                            numberOfMonths={numberOfMonths}
                            selected={selected}
                            onSelect={onSelect}
                            month={month}
                            onMonthChange={setMonth}
                            formatters={{
                                formatMonthDropdown: (date) =>
                                    date.toLocaleString('ru', { month: 'short' }),
                            }}
                        />
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
};
