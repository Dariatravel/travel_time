'use client';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Text } from '@/components/ui/typography';
import { getTextSize } from '@/shared/lib/const';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import cn from 'classnames';
import React, { useState } from 'react';
import { ru } from 'react-day-picker/locale';
import { FaCaretDown } from 'react-icons/fa';
import styles from './style.module.scss';

export interface TodayProps {
    children?: React.ReactNode;
    className?: string;
    open?: boolean;
    onToggle?: () => void;
    currentDate: string;
}

export const Today = ({ className, onToggle, open, currentDate }: TodayProps) => {
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const { isMobile } = useScreenSize();

    return (
        <div className={cn(styles.container, className)}>
            <Text size={getTextSize(isMobile)} view={'success'}>
                Сегодня
            </Text>
            <div className={styles.dateContainer}>
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger asChild>
                        <Text
                            size={isMobile ? 'l' : '2xl'}
                            weight="semibold"
                            view="success"
                            className={cn(
                                styles.currentDate,
                                'flex items-center gap-2 cursor-pointer',
                            )}
                        >
                            <span>{currentDate}</span>
                            <FaCaretDown size={14} />
                        </Text>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                        <Calendar locale={ru} mode="single" selected={new Date()} />
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
};
