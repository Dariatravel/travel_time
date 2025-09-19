'use client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { HotelModal } from '@/features/HotelModal/ui/HotelModal';
import { ReserveModal } from '@/features/ReserveInfo/ui/ReserveModal';
import { RoomModal } from '@/features/RoomInfo/ui/RoomModal';
import { cn } from '@/lib/utils';
import { useGetSession } from '@/shared/api/auth/auth';
import { useGetAllCounts } from '@/shared/api/hotel/hotel';
import { Reserve, useCreateReserve } from '@/shared/api/reserve/reserve';
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery';
import { getTextSize } from '@/shared/lib/const';
import { devLog } from '@/shared/lib/logger';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import { showToast } from '@/shared/ui/Toast/Toast';
import { Text } from '@consta/uikit/Text';
import { nanoid } from 'nanoid';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ToastContainer } from 'react-toastify';
import bed from '../../../public/main/bed.svg';
import building from '../../../public/main/building.svg';
import key from '../../../public/main/key.svg';
import cx from './page.module.scss';

export default function Main() {
    const [isHotelOpen, setIsHotelOpen] = useState<boolean>(false);
    const [isRoomOpen, setIsRoomOpen] = useState<boolean>(false);
    const [isReserveOpen, setIsReserveOpen] = useState<boolean>(false);
    const { data: countsData, isFetching: isCountsLoading } = useGetAllCounts();
    const { data: sessionData } = useGetSession();

    const { isMobile } = useScreenSize();

    useEffect(() => {
        if (sessionData?.session?.access_token) {
            devLog('Access token:', sessionData.session);
        }
    }, [sessionData]);

    const { isPending: isReserveLoading, mutate: createReserve } = useCreateReserve(
        () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotels });
            setIsReserveOpen(false);
            showToast('Бронь успешно добавлена');
        },
        (e) => {
            showToast(`Ошибка при добавлении брони ${e}`, 'error');
        },
    );

    const cards = useMemo(
        () => [
            {
                id: nanoid(),
                title: `Отелей всего в базе`,
                btn: { onClick: () => setIsHotelOpen(true), title: 'Добавить отель' },
                count: countsData?.[0]?.hotel_count ?? 0,
                image: <Image src={building.src} alt={''} width={115} height={140} />,
            },
            {
                id: nanoid(),
                title: 'Номеров всего в базе',
                btn: { onClick: () => setIsRoomOpen(true), title: 'Добавить номер' },
                count: countsData?.[0]?.room_count ?? 0,
                image: <Image src={bed.src} alt={''} width={115} height={140} />,
            },
            {
                id: nanoid(),
                title: 'Броней всего в базе',
                btn: { onClick: () => setIsReserveOpen(true), title: 'Добавить бронь' },
                count: countsData?.[0]?.reserve_count ?? 0,
                image: <Image src={key.src} alt={''} width={115} height={140} />,
            },
        ],
        [countsData],
    );

    const onReserveCreate = useCallback((reserve: Reserve) => {
        devLog('создаю Reserve', reserve);
        createReserve(reserve);
    }, []);

    if (isCountsLoading) return <FullWidthLoader />;

    return (
        <div>
            {/* Модальные окна для каждой карточки */}
            <HotelModal
                isOpen={isHotelOpen}
                onClose={() => setIsHotelOpen(false)}
                currentReserve={null}
            />
            <RoomModal
                isOpen={isRoomOpen}
                onClose={() => setIsRoomOpen(false)}
                currentReserve={null}
            />
            <ReserveModal
                isOpen={isReserveOpen}
                onClose={() => setIsReserveOpen(false)}
                onAccept={onReserveCreate}
                currentReserve={null}
                isLoading={isReserveLoading}
            />

            <Text
                size={getTextSize(isMobile)}
                weight={'semibold'}
                view={'success'}
                className={cx.title}
            >
                Все отели
            </Text>
            <div className="grid grid-cols-3 gap-4" style={{ maxWidth: '1280px' }}>
                {cards.map(({ count, btn, image, title, id }) => {
                    return (
                        <Card key={id} className={cn(cx.card, 'overflow-hidden')}>
                            <CardTitle className="flex align-center text-lg">{title}</CardTitle>
                            <CardContent className="flex align-center ">
                                <div className={cx.image}>{image}</div>
                                <div className={cx.count}>
                                    <Text
                                        view={'success'}
                                        size={isMobile ? '3xl' : '5xl'}
                                        weight={'semibold'}
                                    >
                                        {count}
                                    </Text>
                                </div>
                                <div className={cn(cx.container, 'w-full')}>
                                    <div className={cx.info}>
                                        <Button className={cx.button} onClick={btn.onClick}>
                                            {btn.title}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
            <ToastContainer />
        </div>
    );
}
