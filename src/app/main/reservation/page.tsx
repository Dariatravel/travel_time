'use client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NoDataAvailable } from '@/components/ui/empty-state';
import { Calendar } from '@/features/Calendar';
import { $isHotelsWithFreeRoomsLoading } from '@/features/Reservation/model/reservationStore';
import { SearchForm } from '@/features/Search';
import { FullWidthLoader, Loader } from '@/shared';
import { useInfiniteHotelsQuery } from '@/shared/api/hotel/hotel';
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery';
import { routes } from '@/shared/config/routes';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { $hotelsFilter } from '@/shared/models/hotels';
import { HotelTelegram } from '@/shared/ui/Hotel/HotelTelegram';
import { HotelTitle } from '@/shared/ui/Hotel/HotelTitle';
import { PageTitle } from '@/shared/ui/PageTitle/PageTitle';
import { getHotelUrl } from '@/utils/getHotelUrl';
import { useUnit } from 'effector-react/compat';
import 'my-react-calendar-timeline/style.css';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import './calendar.scss';
import cx from './page.module.css';

export default function Home() {
    const router = useRouter();
    const { isMobile } = useScreenSize();

    const filter = useUnit($hotelsFilter);
    const isFreeHotelsLoading = useUnit($isHotelsWithFreeRoomsLoading);
    const isFilterLoading = filter?.isLoading ?? false;

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const PAGE_SIZE = 2;

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        refetch,
        isPending: isLoadingHotels,
    } = useInfiniteHotelsQuery(filter, PAGE_SIZE);

    console.log({ data });
    const hotels = data?.pages.flatMap((page) => page.data) ?? [];
    const hotelsWithRooms = hotels.filter((hotel) => hotel?.rooms?.length > 0);

    // Обработчик скролла для подгрузки новых данных
    const handleScroll = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        const isNearBottom = scrollTop + clientHeight >= scrollHeight - 150; // 100px до конца

        if (isNearBottom && hasNextPage && !isFetchingNextPage && hotelsWithRooms.length > 0) {
            fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, hotelsWithRooms.length, fetchNextPage]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    useEffect(() => {
        console.log('refetch');
        refetch();
        queryClient.invalidateQueries({
            queryKey: [...QUERY_KEYS.hotels],
        });
        return () => {
            queryClient.invalidateQueries({
                queryKey: [...QUERY_KEYS.hotels],
            });
        };
    }, [filter, refetch]);

    const onHotelClick = (hotel_id: string) => {
        router.push(`${routes.RESERVATION}/${hotel_id}`);
    };

    console.log({
        isLoadingHotels,
        isLoading,
        isFreeHotelsLoading,
        isFilterLoading,
        isFetchingNextPage,
    });
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
                <div className="mt-3">
                    <SearchForm />
                </div>
                <PageTitle title={'Все отели'} hotels={0} />
                <NoDataAvailable
                    title="Не найдено ни одной брони"
                    description="Попробуйте изменить условия поиска"
                />
            </>
        );
    }

    return (
        <div className="mt-1 space-y-1">
            {/* Поисковая форма */}
            <div className="mt-1">
                <SearchForm />
            </div>

            {/* <PageTitle title={'Все отели'} hotels={hotelsWithRooms.length} /> */}
            <div
                ref={scrollContainerRef}
                className="overflow-y-auto space-y-2 p-0 max-h-[75vh] mb-4"
            >
                {hotelsWithRooms.map((hotel) => (
                    <Card key={hotel.id}>
                        <CardHeader className="p-0">
                            <CardTitle>
                                <div className="p-2">
                                    <div className="space-y-1">
                                        {hotel?.type && (
                                            <Badge
                                                // className={cn(cx.tag, cx.hotelTag)}
                                                variant="secondary"
                                                onClick={() =>
                                                    onHotelClick
                                                        ? onHotelClick(hotel?.id)
                                                        : undefined
                                                }
                                            >
                                                {hotel?.type}
                                            </Badge>
                                        )}{' '}
                                        <div className="flex gap-2 items-center">
                                            {' '}
                                            <HotelTitle
                                                size={isMobile ? 's' : 'xl'}
                                                // className={cx.hotelTitle}
                                                href={getHotelUrl(hotel)}
                                                className="text-zinc-500"
                                            >
                                                {hotel?.title}
                                            </HotelTitle>{' '}
                                            <div>
                                                {hotel?.telegram_url && (
                                                    <HotelTelegram url={hotel?.telegram_url} />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        {' '}
                                        <div className="text-gray-500">
                                            Адрес:{hotel?.address}
                                        </div>{' '}
                                    </div>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Calendar hotel={hotel} onHotelClick={onHotelClick} />
                        </CardContent>
                    </Card>
                ))}
            </div>
            {(isFetchingNextPage || isFilterLoading || isFreeHotelsLoading) && <FullWidthLoader />}
        </div>
    );
}
