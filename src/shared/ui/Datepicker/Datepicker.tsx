'use client';

import { ChevronDownIcon, XIcon } from 'lucide-react';
import { type DateRange } from 'react-day-picker';
import { ru } from 'react-day-picker/locale';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

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
}

export const Datepicker = ({ selected, onSelect, label, numberOfMonths = 1 }: DatepickerProps) => {
    /**
     * Обработчик очистки выбранной даты
     */
    const handleClear = (e: React.MouseEvent) => {
        e.preventDefault();
        onSelect(undefined);
        e.stopPropagation();
    };

    const hasSelectedDate = selected?.from;

    return (
        <div className="w-full">
            <Label className="text-sm block">{label}</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        id="dates"
                        className={cn(
                            'relative h-10 w-full justify-between font-normal text-base',
                            {
                                ['text-muted-foreground']: !hasSelectedDate,
                            },
                        )}
                    >
                        {getDateButtonText(selected)}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0">
                            {hasSelectedDate && (
                                <Button
                                    variant="ghost"
                                    onClick={handleClear}
                                    className="hover:bg-gray-200 rounded p-0 w-6 h-6 transition-colors"
                                    aria-label="Очистить дату"
                                >
                                    <XIcon className="h-4 w-4" />
                                </Button>
                            )}
                            <ChevronDownIcon className="h-4 w-4" />
                        </div>
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                    <Calendar
                        locale={ru}
                        mode="range"
                        numberOfMonths={numberOfMonths}
                        selected={selected}
                        onSelect={onSelect}
                        formatters={{
                            formatMonthDropdown: (date) =>
                                date.toLocaleString('ru', { month: 'short' }),
                        }}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
};
