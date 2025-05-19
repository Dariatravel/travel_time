'use client';
import { HotelDTO, HotelWithRoomsCount } from '@/shared/api/hotel/hotel';
import { PagesEnum, routes } from '@/shared/config/routes';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { HotelImage } from '@/shared/ui/Hotel/HotelImage/HotelImage';
import { HotelTelegram } from '@/shared/ui/Hotel/HotelTelegram';
import { HotelTitle } from '@/shared/ui/Hotel/HotelTitle';
import { IconForward } from '@consta/icons/IconForward';
import { Button as ConstaButton } from '@consta/uikit/Button';
import { Card } from '@consta/uikit/Card';
import { Text } from '@consta/uikit/Text';
import { Flex } from 'antd';
import cn from 'classnames';
import Link from 'next/link';
import React from 'react';
import hotelImage from './hotel.svg';
import styles from './style.module.css';

export interface HotelProps {
    children?: React.ReactNode;
    className?: string;
    hotel: HotelWithRoomsCount;
    onDelete: (id: string) => void;
    onEdit: (hotel: HotelDTO) => void;
}

export const Hotel = ({ className, hotel, onDelete, onEdit }: HotelProps) => {
    const { telegram_url, id, title, rating, type, phone, address, description, image_id } = hotel;
    const { isMobile } = useScreenSize();

    const redirectUrl = `${routes[PagesEnum.HOTELS]}/${hotel?.id}`;

    const getTextSize = (isMobile: boolean) => {
        if (isMobile) {
            return 's';
        }
        return 'm';
    };
    return (
        <Card className={cn(styles.container, className)} shadow title={title}>
            <Flex gap={isMobile ? 'middle' : 'large'}>
                <HotelImage src={hotelImage.src} type={type} />
                <div className={styles.infoContainer}>
                    <Flex vertical justify="space-around" className={styles.verticalContainer}>
                        <div>
                            <HotelTitle size={isMobile ? 'm' : 'l'}>{title}</HotelTitle>
                            <div className={styles.info}>
                                <Text size={getTextSize(isMobile)}>{hotel?.rooms?.[0]?.count ?? 0} номеров</Text>
                                <div className={styles.address}>
                                    <Text size={getTextSize(isMobile)}>Адрес: {address}</Text>
                                </div>
                                <Text size={getTextSize(isMobile)}>Номер: {phone}</Text>
                            </div>
                        </div>

                        <Flex className={styles.actions} align={'center'} gap={'small'}>
                            {/*<ConfirmButton onConfirm={() => onDelete(id)} />*/}
                            <div className={styles.telegram}>{telegram_url && <HotelTelegram url={telegram_url} />}</div>
                            <div style={{ alignSelf: 'end', marginLeft: 'auto' }}>
                                <Link href={redirectUrl}>
                                    <ConstaButton size={'m'} view={'clear'} iconRight={IconForward} label={'Подробнее'} />
                                </Link>
                            </div>
                        </Flex>
                    </Flex>
                </div>
            </Flex>
        </Card>
    );
};
