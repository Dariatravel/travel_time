'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useGetAllHotels } from '@/shared/api/hotel/hotel';
import { Calendar } from '@/features/Calendar/ui/Calendar';
import { Loader } from '@/shared/ui/Loader/Loader';
import cx from './page.module.css';
import { useUnit } from 'effector-react/compat';
import { $hotelsFilter } from '@/shared/models/hotels';
import 'my-react-calendar-timeline/style.css';
import './calendar.scss';
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery';
import { $isHotelsWithFreeRoomsLoading } from '@/features/Reservation/model/reservationStore';
import { PageTitle } from '@/shared/ui/PageTitle/PageTitle';
import { useRouter } from 'next/navigation';
import { ResponsesNothingFound } from '@consta/uikit/ResponsesNothingFound';
import { routes } from '@/shared/config/routes';

export default function Home() {
    const router = useRouter();
    const [page, setPage] = useState(1);

    const filter = useUnit($hotelsFilter);
    const isFreeHotelsLoading = useUnit($isHotelsWithFreeRoomsLoading);
    const { isFetching, error, data: hotels, refetch } = useGetAllHotels(!filter, filter);

    // @ts-expect-error - Фильтрация отелей с количеством комнат
    const hotelsWithRooms = useMemo(() => hotels?.filter((hotel) => hotel?.rooms?.[0]?.count > 0), [hotels]);
    const onHotelClick = (hotel_id: string) => {
        router.push(`${routes.RESERVATION}/${hotel_id}`);
    };

    useEffect(() => {
        refetch();
        queryClient.invalidateQueries({
            queryKey: [...QUERY_KEYS.roomsWithReservesByHotel],
        });
    }, [filter]);

    if (isFetching || isFreeHotelsLoading) {
        return (
            <>
                <PageTitle title={'Все отели'} hotels={0} />
                <div className={cx.loaderContainer}>
                    <Loader />
                </div>
            </>
        );
    }

    if (hotels?.length === 0) {
        return (
            <>
                <PageTitle title={'Все отели'} hotels={0} />
                <ResponsesNothingFound actions={<></>} title={'Не найдено ни одной брони'} description={'Попробуйте изменить условия поиска'} />
            </>
        );
    }

    return (
        <div>
            <PageTitle title={'Все отели'} hotels={hotels?.length} />

            {hotelsWithRooms?.map((hotel) => <Calendar hotel={hotel} key={hotel.id} onHotelClick={onHotelClick} />)}
            {/*<Pagination value={page} onChange={setPage} items={hotels?.length} />;*/}
        </div>
    );
}
