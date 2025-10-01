'use client';
import { Text } from '@/components/ui/typography';
import cn from 'classnames';
import React from 'react';
import styles from './style.module.css';

export interface HotelTitleProps {
    children?: React.ReactNode;
    className?: string;
    href?: string;
    size?:
        | 's'
        | 'm'
        | 'xl'
        | 'xs'
        | 'l'
        | '2xl'
        | '3xl'
        | '4xl'
        | undefined;
}

export const HotelTitle = ({ className, href, children, size = 'xl' }: HotelTitleProps) => {
    const isLink = !!href;
    return (
        <a
            className={cn(styles.container, className)}
            href={href}
            target={isLink ? '_blank' : undefined}
        >
            <Text className={cn(styles.title, 'uppercase')} weight={'semibold'} size={size}>
                {children}
            </Text>
        </a>
    );
};
