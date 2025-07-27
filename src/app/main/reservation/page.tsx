'use client';
import { Calendar } from '@/features/Calendar/ui/Calendar';
import { $isHotelsWithFreeRoomsLoading } from '@/features/Reservation/model/reservationStore';
import { useInfiniteHotelsQuery } from '@/shared/api/hotel/hotel';
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery';
import { routes } from '@/shared/config/routes';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { $hotelsFilter } from '@/shared/models/hotels';
import { Loader } from '@/shared/ui/Loader/Loader';
import { PageTitle } from '@/shared/ui/PageTitle/PageTitle';
import { ResponsesNothingFound } from '@consta/uikit/ResponsesNothingFound';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useUnit } from 'effector-react/compat';
import 'my-react-calendar-timeline/style.css';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import './calendar.scss';
import cx from './page.module.css';

export default function Home() {
    const router = useRouter();
    const { isMobile } = useScreenSize();

    const filter = useUnit($hotelsFilter);
    const isFreeHotelsLoading = useUnit($isHotelsWithFreeRoomsLoading);

    const parentRef = useRef<HTMLDivElement>(null);

    // Определяем размеры в зависимости от устройства

    const ITEM_GAP = 32;
    const ITEM_HEIGHT = isMobile ? 375 : 300;
    const VIRTUAL_HEIGHT = ITEM_HEIGHT + ITEM_GAP;
    const PAGE_SIZE = 3;

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error, refetch } = useInfiniteHotelsQuery(filter, PAGE_SIZE);

    console.log({ data });
    const hotels = data?.pages.flatMap((page) => page.data) ?? [];
    const hotelsWithRooms = hotels.filter((hotel) => hotel?.rooms?.length > 0);
    const rowVirtualizer = useVirtualizer({
        count: hotelsWithRooms.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => VIRTUAL_HEIGHT,
        overscan: 1,
    });

    useEffect(() => {
        const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse();
        if (lastItem && lastItem.index >= hotelsWithRooms.length - 1 && hasNextPage && !isFetchingNextPage && hotelsWithRooms.length > 0) {
            fetchNextPage();
        }
    }, [rowVirtualizer.getVirtualItems(), hasNextPage, isFetchingNextPage, hotelsWithRooms.length, fetchNextPage]);

    useEffect(() => {
        refetch();
        queryClient.invalidateQueries({
            queryKey: [...QUERY_KEYS.hotels],
        });
        return () => {
            queryClient.invalidateQueries({
                queryKey: [...QUERY_KEYS.hotels],
            });
        };
    }, [filter]);

    const onHotelClick = (hotel_id: string) => {
        router.push(`${routes.RESERVATION}/${hotel_id}`);
    };

    if (isLoading || isFreeHotelsLoading) {
        return (
            <>
                <PageTitle title={'Все отели'} hotels={0} />
                <div className={cx.loaderContainer}>
                    <Loader />
                </div>
            </>
        );
    }

    if (hotelsWithRooms.length === 0) {
        return (
            <>
                <PageTitle title={'Все отели'} hotels={0} />
                <ResponsesNothingFound actions={<></>} title={'Не найдено ни одной брони'} description={'Попробуйте изменить условия поиска'} />
            </>
        );
    }

    return (
        <div>
            <PageTitle title={'Все отели'} hotels={hotelsWithRooms.length} />
            <div ref={parentRef} className={cx.scrollContainer}>
                <div
                    style={{
                        height: `500px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const hotel = hotelsWithRooms[virtualRow.index];
                        if (!hotel) return null;
                        return (
                            <div
                                key={hotel.id}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: `${VIRTUAL_HEIGHT}px`,
                                    transform: `translateY(${virtualRow.start}px)`,
                                    willChange: 'transform',
                                }}
                            >
                                <Calendar hotel={hotel} onHotelClick={onHotelClick} />
                            </div>
                        );
                    })}
                </div>
            </div>
            {isFetchingNextPage && <Loader />}
        </div>
    );
}
