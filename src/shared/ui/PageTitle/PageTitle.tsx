'use client';
import { Text } from '@/components/ui/typography';
import { getTextSize } from '@/shared/lib/const';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { TravelButton } from '@/shared/ui/Button/Button';
import cn from 'classnames';
import React from 'react';
import styles from './style.module.scss';

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
        <div className={cn(styles.headingContainer, 'flex items-center gap-2', className)}>
            <div>
                <Text size={getTextSize(isMobile)} weight={'semibold'} view={'success'}>
                    {title}
                </Text>
                {/* <Flex gap={'middle'}>
                    <Text size={isMobile ? 's' : 'xl'} view={'success'} className={styles.subTitle}>
                        {getTitle(hotels, rooms)}
                    </Text>
                </Flex> */}
            </div>
            {buttonProps && (
                <div className={styles.buttonContainer}>
                    <TravelButton
                        label={buttonProps.label}
                        onClick={buttonProps.onClick}
                        size={isMobile ? 's' : 'm'}
                        className={styles.button}
                    />
                </div>
            )}
        </div>
    );
};
