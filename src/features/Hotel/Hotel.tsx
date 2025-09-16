'use client';
import { Button } from '@/components/ui/button';
import { HotelDTO, HotelRoomsDTO } from '@/shared/api/hotel/hotel';
import { PagesEnum, routes } from '@/shared/config/routes';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { HotelImage } from '@/shared/ui/Hotel/HotelImage/HotelImage';
import { HotelTelegram } from '@/shared/ui/Hotel/HotelTelegram';
import { HotelTitle } from '@/shared/ui/Hotel/HotelTitle';
import { getHotelUrl } from '@/utils/getHotelUrl';
import { IconEdit } from '@consta/icons/IconEdit';
import { IconForward } from '@consta/icons/IconForward';
import { Button as ConstaButton } from '@consta/uikit/Button';
import { Card } from '@consta/uikit/Card';
import { Text } from '@consta/uikit/Text';
import cn from 'classnames';
import Link from 'next/link';
import React from 'react';
import hotelImage from './hotel.svg';
import styles from './style.module.css';

export interface HotelProps {
    children?: React.ReactNode;
    className?: string;
    hotel: HotelRoomsDTO;
    onDelete: (id: string) => void;
    onEdit: (hotel: HotelDTO) => void;
}

export const Hotel = ({ className, hotel, onDelete, onEdit }: HotelProps) => {
    const { telegram_url, title, type, phone, address } = hotel;
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
            <div className="flex gap-2">
                <HotelImage src={hotelImage.src} type={type} />
                <div className={styles.infoContainer}>
                    <div
                        className={cn(
                            styles.verticalContainer,
                            'flex flex-col gap-2 vertical space-around',
                        )}
                    >
                        <div>
                            <div className="flex flex-start justify-between">
                                {/* TODO: Рейтинг отключён, оставлен для истории, если 01.07.2025
                не потребуется, то удалить*/}
                                {/*<HotelRating rating={rating} />{' '}*/}
                                <HotelTitle size={isMobile ? 'm' : 'l'} href={getHotelUrl(hotel)}>
                                    {title}
                                </HotelTitle>
                                <Button onClick={() => onEdit(hotel)}>
                                    <IconEdit />
                                </Button>
                            </div>

                            <div className={styles.info}>
                                <Text size={getTextSize(isMobile)}>
                                    {hotel?.rooms?.length ?? 0} номеров
                                </Text>
                                <div className={cn(styles.address, 'flex flex-col gap-2')}>
                                    <Text size={getTextSize(isMobile)}>Адрес: </Text>
                                    <div className={styles.addressTag}>
                                        <Text size={getTextSize(isMobile)}>{address}</Text>
                                    </div>
                                </div>
                                <Text size={getTextSize(isMobile)}>Номер: {phone}</Text>
                            </div>
                        </div>

                        <div className={cn(styles.actions, 'flex flex-col items-center gap-2')}>
                            {/*<ConfirmButton onConfirm={() => onDelete(id)} />*/}
                            <div className={styles.telegram}>
                                {telegram_url && <HotelTelegram url={telegram_url} />}
                            </div>
                            <div style={{ alignSelf: 'end', marginLeft: 'auto' }}>
                                <Link href={redirectUrl}>
                                    <ConstaButton
                                        size={'m'}
                                        view={'clear'}
                                        iconRight={IconForward}
                                        label={'Подробнее'}
                                    />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
};
