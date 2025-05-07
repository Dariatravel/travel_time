'use client';
import React, { useState } from 'react';
import styles from './style.module.scss';
import cn from 'classnames';
import { Text } from '@consta/uikit/Text';
import cx from '@/app/main/layout.module.scss';
import { FaCaretDown } from 'react-icons/fa';
import { DateTime } from '@consta/uikit/DateTime';
import { useScreenSize } from '@/shared/lib/useScreenSize';

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
            <Text size={isMobile ? 'm' : 'xl'} view={'success'}>
                Сегодня
            </Text>
            <div className={styles.dateContainer}>
                <Text size={isMobile ? 'l' : '2xl'} weight={'semibold'} view={'success'} cursor={'pointer'} onClick={() => setIsCalendarOpen((prev) => !prev)} className={styles.currentDate}>
                    <span>{currentDate}</span>
                    <FaCaretDown size={14} />
                </Text>
                <DateTime type="date" className={cn(cx.date, { [cx.open]: isCalendarOpen })} />
            </div>
        </div>
    );
};
