'use client';
import React from 'react';
import styles from './style.module.scss';
import cn from 'classnames';
import { Text } from '@consta/uikit/Text';
import { Flex } from 'antd';
import { TravelButton } from '@/shared/ui/Button/Button';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { getTextSize } from '@/shared/lib/const';

export interface PageTitleProps {
    title: string;
    children?: React.ReactNode;
    className?: string;
    hotels?: number;
    rooms?: number;
    buttonProps?: {
        className?: string;
        label: string;
        onClick?: () => void;
    };
}

export const PageTitle = ({ className, title, hotels, rooms, buttonProps }: PageTitleProps) => {
    const { isMobile } = useScreenSize();
    const getTitle = (hotels?: number, rooms?: number) => {
        if (hotels && rooms) {
            return ` Всего ${hotels} отелей, ${rooms} номеров`;
        } else if (hotels || hotels === 0) {
            return ` Всего ${hotels} отелей`;
        } else {
            return ` Всего ${rooms} номеров`;
        }
    };
    return (
        <Flex className={cn(styles.headingContainer, className)}>
            <div>
                <Text size={getTextSize(isMobile)} weight={'semibold'} view={'success'}>
                    {title}
                </Text>
                <Flex gap={'middle'}>
                    <Text size={isMobile ? 's' : 'm'} view={'success'} className={styles.subTitle}>
                        {getTitle(hotels, rooms)}
                    </Text>
                </Flex>
            </div>
            {buttonProps && (
                <div className={styles.buttonContainer}>
                    <TravelButton label={buttonProps.label} onClick={buttonProps.onClick} size={isMobile ? 's' : 'm'} className={styles.button} />
                </div>
            )}
        </Flex>
    );
};
