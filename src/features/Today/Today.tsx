'use client';
import React, { useState } from 'react';
import styles from './style.module.scss';
import cn from 'classnames';
import { Text } from '@consta/uikit/Text';
import cx from '@/app/main/layout.module.scss';
import { FaCaretDown } from 'react-icons/fa';
import { DateTime } from '@consta/uikit/DateTime';

export interface TodayProps {
    children?: React.ReactNode;
    className?: string;
    open?: boolean;
    onToggle?: () => void;
    currentDate: string;
}

export const Today = ({ className, onToggle, open, currentDate }: TodayProps) => {
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    return (
        <div className={cn(styles.container, className)}>
            <Text size="xl" view={'success'}>
                Сегодня
            </Text>
            <div className={styles.dateContainer}>
                <Text size="2xl" view={'success'} cursor={'pointer'} onClick={() => setIsCalendarOpen((prev) => !prev)} className={styles.currentDate}>
                    <span>{currentDate}</span>
                    <FaCaretDown size={14} />
                </Text>
                <DateTime type="date" className={cn(cx.date, { [cx.open]: isCalendarOpen })} />
            </div>
        </div>
    );
};
