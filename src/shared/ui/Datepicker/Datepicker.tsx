'use client';

import { useState } from 'react';

import { formatDateRange } from 'little-date';
import { ChevronDownIcon } from 'lucide-react';
import { type DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface DatepickerProps {
    selected: DateRange | undefined;
    onSelect: (range: DateRange | undefined) => void;
    label: string;
}

export const Datepicker = ({ selected, onSelect, label }: DatepickerProps) => {
    const [range, setRange] = useState<DateRange | undefined>({
        from: selected?.from,
        to: selected?.to,
    });

    return (
        <div className="w-full max-w-xs space-y-2">
            <Label className="text-sm font-medium text-gray-700 mb-2 block">{label}</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        id="dates"
                        className="w-full justify-between font-normal"
                    >
                        {selected?.from && selected?.to
                            ? formatDateRange(range.from, range.to, {
                                  includeTime: false,
                              })
                            : 'Выберите время'}
                        <ChevronDownIcon />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                    <Calendar
                        mode="range"
                        selected={selected}
                        onSelect={(range) => {
                            onSelect(range);
                        }}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
};
