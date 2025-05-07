'use client';
import React from 'react';
import styles from './style.module.scss';
import cn from 'classnames';
import { Text } from '@consta/uikit/Text';
import { Flex } from 'antd';
import { TravelButton } from '@/shared/ui/Button/Button';

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
        <Flex className={cn(styles.headingContainer, className)} align={'center'}>
            <div>
                <Text size="2xl" weight={'semibold'} view={'success'}>
                    {title}
                </Text>
                <Flex gap={'middle'}>
                    <Text size="m" view={'success'} style={{ marginTop: '0.5rem' }}>
                        {getTitle(hotels, rooms)}
                    </Text>
                </Flex>
            </div>
            {buttonProps && (
                <div style={{ marginLeft: 'auto' }}>
                    <TravelButton label={buttonProps.label} onClick={buttonProps.onClick} />
                </div>
            )}
        </Flex>
    );
};
