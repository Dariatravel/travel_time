'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import { RoomDTO } from '@/shared/api/room/room';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { HotelImage } from '@/shared/ui/Hotel/HotelImage/HotelImage';
import { HotelTitle } from '@/shared/ui/Hotel/HotelTitle';
import { IconEdit } from '@consta/icons/IconEdit';
import { Button } from 'antd';
import cn from 'classnames';
import React from 'react';
import hotelImage from './room.svg';
import styles from './style.module.scss';

export interface HotelProps {
    children?: React.ReactNode;
    className?: string;
    room: RoomDTO;
    onEdit: (room: RoomDTO) => void;
}

export const Room = ({ className, room, onEdit }: HotelProps) => {
    const { title, quantity, price, comment } = room;
    const { isMobile } = useScreenSize();

    const getTextSize = (isMobile: boolean) => {
        if (isMobile) {
            return 's';
        }
        return 'm';
    };
    return (
        <Card className={cn(styles.container, className)}>
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex gap-6">
                    <HotelImage src={hotelImage.src} />
                    <div className={styles.infoContainer}>
                        <div
                            className={cn(styles.verticalContainer, 'flex flex-col justify-start')}
                        >
                            <div>
                                <div className="flex items-center justify-between">
                                    <HotelTitle>{title}</HotelTitle>
                                    <Button
                                        icon={<IconEdit />}
                                        color={'primary'}
                                        type={'text'}
                                        onClick={() => onEdit(room)}
                                    />
                                </div>

                                <div className={styles.info}>
                                    <Text size={getTextSize(isMobile)}>
                                        Вместимость: {quantity}
                                    </Text>
                                    <Text size={getTextSize(isMobile)}>
                                        Стоимость: {price}/сутки
                                    </Text>
                                    <Text size={getTextSize(isMobile)}>Заметки: {comment}</Text>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
