'use client';
import React from 'react';
import styles from './style.module.scss';
import cn from 'classnames';
import { Card } from '@consta/uikit/Card';
import { HotelImage } from '@/shared/ui/Hotel/HotelImage/HotelImage';
import hotelImage from './room.svg';
import { HotelTitle } from '@/shared/ui/Hotel/HotelTitle';
import { Flex, Button } from 'antd';
import { IconEdit } from '@consta/icons/IconEdit';
import { RoomDTO } from '@/shared/api/room/room';

export interface HotelProps {
    children?: React.ReactNode;
    className?: string;
    room: RoomDTO;
    onEdit: (room: RoomDTO) => void;
}

export const Room = ({ className, room, onEdit }: HotelProps) => {
    const { id, title, quantity, price, comment } = room;

    return (
        <Card className={cn(styles.container, className)} shadow title={title}>
            <Flex gap={'large'}>
                <HotelImage src={hotelImage.src} width={260} height={216} />
                <div className={styles.infoContainer}>
                    <Flex vertical justify="flex-start" className={styles.verticalContainer}>
                        <div>
                            <Flex align={'center'} justify={'space-between'}>
                                <HotelTitle>{title}</HotelTitle>
                                <Button icon={<IconEdit />} color={'primary'} type={'text'} onClick={() => onEdit(room)} />
                            </Flex>

                            <div className={styles.info}>
                                <div>Вместимость: {quantity}</div>
                                <div>Стоимость: {price}/сутки</div>
                                <div>Заметки: {comment}</div>
                            </div>
                        </div>
                    </Flex>
                </div>
            </Flex>
        </Card>
    );
};
