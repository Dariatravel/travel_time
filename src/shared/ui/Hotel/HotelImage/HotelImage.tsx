'use client';
import { Badge } from '@/components/ui/badge';
import cn from 'classnames';
import Image from 'next/image';
import React from 'react';
import styles from './style.module.scss';

export interface HotelImageProps {
    children?: React.ReactNode;
    className?: string;
    tagClassName?: string;
    src: string;
    type?: string;
    onClick?: () => void;
}

export const HotelImage = ({ type, className, src, onClick, tagClassName }: HotelImageProps) => {
    return (
        <div className={cn(styles.container, className)} onClick={onClick}>
            {type && (
                <Badge className={cn(styles.tag, tagClassName)} variant="secondary">
                    {type}
                </Badge>
            )}
            <Image
                className={styles.hotelIcon}
                src={src}
                alt={'Изображение отеля'}
                layout={'fill'}
                objectFit={'cover'}
            />
        </div>
    );
};
