'use client';
import cx from '@/app/main/layout.module.scss';
import { getTextSize } from '@/shared/lib/const';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { DateTime } from '@consta/uikit/DateTime';
import { Text } from '@consta/uikit/Text';
import cn from 'classnames';
import React, { useState } from 'react';
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
                <Text
                    size={isMobile ? 'l' : '2xl'}
                    weight={'semibold'}
                    view={'success'}
                    cursor={'pointer'}
                    onClick={() => setIsCalendarOpen((prev) => !prev)}
                    className={cn(styles.currentDate, 'flex items-center gap-2')}
                >
                    <span>{currentDate}</span>
                    <FaCaretDown size={14} />
                </Text>
                <DateTime type="date" className={cn(cx.date, { [cx.open]: isCalendarOpen })} />
            </div>
        </div>
    );
};
