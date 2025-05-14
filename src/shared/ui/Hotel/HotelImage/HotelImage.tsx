'use client';
import React from 'react';
import styles from './style.module.scss';
import cn from 'classnames';
import Image from 'next/image';
import { Tag } from '@consta/uikit/Tag';

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
            {type && <Tag className={cn(styles.tag, tagClassName)} label={type} size={'s'} mode={'info'} />}
            <Image className={styles.hotelIcon} src={src} alt={'Изображение отеля'} layout={'fill'} objectFit={'cover'} />
        </div>
    );
};
