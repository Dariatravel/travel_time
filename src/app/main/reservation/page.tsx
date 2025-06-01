'use client';
import { Calendar } from '@/features/Calendar/ui/Calendar';
import { $isHotelsWithFreeRoomsLoading } from '@/features/Reservation/model/reservationStore';
import { useGetAllHotels } from '@/shared/api/hotel/hotel';
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery';
import { routes } from '@/shared/config/routes';
import { $hotelsFilter } from '@/shared/models/hotels';
import { Loader } from '@/shared/ui/Loader/Loader';
import { PageTitle } from '@/shared/ui/PageTitle/PageTitle';
import { ResponsesNothingFound } from '@consta/uikit/ResponsesNothingFound';
import { useUnit } from 'effector-react/compat';
import 'my-react-calendar-timeline/style.css';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import './calendar.scss';
import cx from './page.module.css';

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

    // const { status, data, error, isFetching, isFetchingNextPage, fetchNextPage, hasNextPage } = useInfiniteQuery({
    //     queryKey: ['projects'],
    //     queryFn: (ctx) => getAllHotels(filter, 10, ctx.pageParam),
    //     getNextPageParam: (lastGroup) => lastGroup.nextOffset,
    //     initialPageParam: 0,
    // });
    // const rowVirtualizer = useVirtualizer({
    //     count: hasNextPage ? allRows.length + 1 : allRows.length,
    //     getScrollElement: () => parentRef.current,
    //     estimateSize: () => 100,
    //     overscan: 5,
    // });
    // React.useEffect(() => {
    //     const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse();

    //     if (!lastItem) {
    //         return;
    //     }

    //     if (lastItem.index >= allRows.length - 1 && hasNextPage && !isFetchingNextPage) {
    //         fetchNextPage();
    //     }
    // }, [hasNextPage, fetchNextPage, allRows.length, isFetchingNextPage, rowVirtualizer.getVirtualItems()]);

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
