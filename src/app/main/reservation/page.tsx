'use client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NoDataAvailable } from '@/components/ui/empty-state';
import { VALUE_TO_LABEL_MAP } from '@/features/AdvancedFilters/lib/constants';
import { Calendar } from '@/features/Calendar';
import { HotelModal } from '@/features/HotelModal/ui/HotelModal';
import { $isHotelsWithFreeRoomsLoading } from '@/features/Reservation/model/reservationStore';
import { RoomModal } from '@/features/RoomInfo/ui/RoomModal';
import { SearchForm } from '@/features/Search';
import { FullWidthLoader, Loader } from '@/shared';
import { HotelRoomsReservesDTO, useInfiniteHotelsQuery } from '@/shared/api/hotel/hotel';
import { RoomDTO } from '@/shared/api/room/room';
import { routes } from '@/shared/config/routes';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { $hotelsFilter } from '@/shared/models/hotels';
import { HotelTelegram } from '@/shared/ui/Hotel/HotelTelegram';
import { HotelTitle } from '@/shared/ui/Hotel/HotelTitle';
import { PageTitle } from '@/shared/ui/PageTitle/PageTitle';
import { getHotelUrl } from '@/utils/getHotelUrl';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useUnit } from 'effector-react/compat';
import { MapPin } from 'lucide-react';
import 'my-react-calendar-timeline/style.css';
import { useRouter } from 'next/navigation';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './calendar.scss';
import cx from './page.module.css';

// Мемоизированный компонент карточки отеля для оптимизации виртуализации
const HotelCard = memo(
    ({
        virtualItem,
        hotel,
        isMobile,
        onHotelClick,
        onHotelInfoClick,
        onRoomClick,
        measureElement,
    }: {
        virtualItem: { index: number; start: number; size: number };
        hotel: HotelRoomsReservesDTO;
        isMobile: boolean;
        onHotelClick?: (hotel_id: string) => void;
        onHotelInfoClick?: (hotel: HotelRoomsReservesDTO) => void;
        onRoomClick?: (room: RoomDTO, hotel: HotelRoomsReservesDTO) => void;
        measureElement: (element: Element | null) => void;
    }) => {
        const elementRef = useRef<HTMLDivElement>(null);

        // Измеряем реальную высоту элемента после рендера и при изменении данных
        useEffect(() => {
            if (elementRef.current) {
                // Используем небольшой таймаут для того, чтобы календарь успел отрендериться
                const timeoutId = setTimeout(() => {
                    if (elementRef.current) {
                        measureElement(elementRef.current);
                    }
                }, 0);

                return () => clearTimeout(timeoutId);
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [hotel.rooms?.length]); // Измеряем при изменении количества номеров

        const getHotelCity = (city: string) => {
            return VALUE_TO_LABEL_MAP[city as keyof typeof VALUE_TO_LABEL_MAP];
        };
        return (
            <div
                ref={elementRef}
                data-index={virtualItem.index}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                    willChange: 'transform', // Оптимизация для GPU
                }}
                className="px-1 pb-3 sm:px-2"
            >
                <Card className="h-full border border-border/60 shadow-sm">
                    <CardHeader className="p-0">
                        <CardTitle>
                            <div className="space-y-2 p-3 sm:p-4">
                                <div className="space-y-1">
                                    {hotel?.type && (
                                        <Badge
                                            variant="secondary"
                                            onClick={() =>
                                                onHotelClick ? onHotelClick(hotel?.id) : undefined
                                            }
                                            className="cursor-pointer"
                                        >
                                            {hotel?.type}
                                        </Badge>
                                    )}{' '}
                                    <div className="flex items-center gap-2">
                                        <HotelTitle
                                            size={isMobile ? 's' : 'xl'}
                                            href={getHotelUrl(hotel)}
                                            className="text-sm font-semibold text-zinc-600 sm:text-xl"
                                        >
                                            {hotel?.title}
                                        </HotelTitle>
                                        <div className="flex items-center gap-2">
                                            {hotel?.telegram_url && (
                                                <HotelTelegram url={hotel?.telegram_url} />
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-3 text-xs"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onHotelInfoClick?.(hotel);
                                                }}
                                            >
                                                Об отеле
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                                    <div className="flex shrink-0 items-center gap-2">
                                        <MapPin className="h-4 w-4" />
                                        <span className="font-medium text-foreground">Город:</span>
                                        {getHotelCity(hotel?.city)}
                                    </div>
                                    <div className="min-w-0 flex-1 break-words text-foreground/80">
                                        Адрес: {hotel?.address}
                                    </div>
                                </div>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Calendar
                            hotel={hotel}
                            onHotelClick={onHotelClick}
                            onRoomClick={(room) => {
                                // Вызываем обработчик из родительского компонента
                                onRoomClick?.(room, hotel);
                            }}
                        />
                    </CardContent>
                </Card>
            </div>
        );
    },
    (prevProps, nextProps) => {
        // Мемоизация: обновляем только если изменились критичные свойства
        // Сравниваем hotel.id, позицию и данные отеля для обновления при изменении броней
        const prevRoomIds = prevProps.hotel.rooms.map((r) => r.id).join(',');
        const nextRoomIds = nextProps.hotel.rooms.map((r) => r.id).join(',');
        const prevReservesCount = prevProps.hotel.rooms
            .map((r) => r.reserves?.length || 0)
            .join(',');
        const nextReservesCount = nextProps.hotel.rooms
            .map((r) => r.reserves?.length || 0)
            .join(',');

        const isSame =
            prevProps.hotel.id === nextProps.hotel.id &&
            prevProps.virtualItem.start === nextProps.virtualItem.start &&
            prevProps.isMobile === nextProps.isMobile &&
            prevRoomIds === nextRoomIds &&
            prevReservesCount === nextReservesCount;

        return isSame;
    },
);

HotelCard.displayName = 'HotelCard';

export default function Home() {
    const router = useRouter();
    const { isMobile } = useScreenSize();

    const [isHotelModalOpen, setIsHotelModalOpen] = useState(false);
    const [currentHotel, setCurrentHotel] = useState<HotelRoomsReservesDTO | null>(null);
    const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
    const [currentRoom, setCurrentRoom] = useState<RoomDTO | null>(null);

    const filter = useUnit($hotelsFilter);
    const isFreeHotelsLoading = useUnit($isHotelsWithFreeRoomsLoading);
    const isFilterLoading = filter?.isLoading ?? false;

    const scrollContainerRef = useRef<HTMLDivElement>(null); // оставляем для совместимости измерений, но не используем как скролл-элемент
    const PAGE_SIZE = 2;

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } =
        useInfiniteHotelsQuery(filter, PAGE_SIZE);

    const hotels = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
    const hotelsWithRooms = useMemo(
        () => hotels.filter((hotel) => hotel?.rooms?.length > 0),
        [hotels],
    );

    // Виртуализатор для списка календарей с динамической высотой
    const virtualizer = useWindowVirtualizer({
        count: hotelsWithRooms.length,
        estimateSize: (index) => {
            // Вычисляем примерную высоту на основе количества номеров в отеле
            const hotel = hotelsWithRooms[index];
            if (!hotel) return 400;

            // Базовая высота: заголовок карточки (~80px) + padding/margin (~20px)
            const headerHeight = 80;
            const paddingMargin = 20;
            const gap = 12; // небольшой отступ между карточками

            // Высота календаря зависит от количества номеров
            // Каждая группа (номер) занимает примерно 40-50px
            // Но календарь имеет max-height: 250px, поэтому минимальная высота = 250px
            const roomsCount = hotel.rooms?.length || 1;
            const roomHeight = 45; // Примерная высота одной строки номера
            const calendarHeight = Math.min(250, Math.max(150, roomsCount * roomHeight + 60)); // min 150px, max 250px

            return headerHeight + paddingMargin + calendarHeight + gap;
        },
        overscan: 1,
    });

    // Обработчик скролла для подгрузки новых данных - используем IntersectionObserver для производительности
    useEffect(() => {
        if (hotelsWithRooms.length === 0) return;

        let lastCheckTime = 0;
        const THROTTLE_MS = 200; // Throttle для проверки конца списка

        const checkLoadMore = () => {
            const now = Date.now();
            if (now - lastCheckTime < THROTTLE_MS) return;
            lastCheckTime = now;

            const virtualItems = virtualizer.getVirtualItems();
            if (virtualItems.length === 0) return;

            const lastItem = virtualItems[virtualItems.length - 1];
            if (!lastItem) return;

            // Проверяем, дошли ли до конца видимых элементов
            const isNearEnd = lastItem.index >= hotelsWithRooms.length - 2;

            if (isNearEnd && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
            }
        };

        // Используем requestAnimationFrame для плавного скролла
        let rafId: number | null = null;
        const handleScroll = () => {
            if (rafId === null) {
                rafId = window.requestAnimationFrame(() => {
                    checkLoadMore();
                    rafId = null;
                });
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hotelsWithRooms.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

    useEffect(() => {
        refetch();
    }, [filter, refetch]);

    const onHotelClick = (hotel_id: string) => {
        router.push(`${routes.RESERVATION}/${hotel_id}`);
    };

    const onHotelInfoClick = (hotel: HotelRoomsReservesDTO) => {
        setCurrentHotel(hotel);
        setIsHotelModalOpen(true);
    };

    const onRoomClick = (room: RoomDTO, hotel: HotelRoomsReservesDTO) => {
        setCurrentRoom(room);
        setCurrentHotel(hotel);
        setIsRoomModalOpen(true);
    };

    // Объединяем состояния загрузки для избежания скачков UI
    const isInitialLoading = isLoading || isFreeHotelsLoading || isFilterLoading;

    const pagePadding = 'px-0 pb-6 pt-3 sm:px-0 sm:pb-8';
    const searchWrapper = (
        <div className="sticky top-0 z-30 bg-background/100">
            <SearchForm />
        </div>
    );

    const renderLayout = (content: ReactNode) => (
        <div className={`flex min-h-screen flex-col gap-4 ${pagePadding}`}>
            {searchWrapper}
            {content}
            <HotelModal
                isOpen={isHotelModalOpen}
                onClose={() => {
                    setIsHotelModalOpen(false);
                    setCurrentHotel(null);
                }}
                currentReserve={
                    currentHotel
                        ? {
                              hotel: currentHotel,
                              room: undefined,
                              reserve: undefined,
                          }
                        : null
                }
            />
            <RoomModal
                isOpen={isRoomModalOpen}
                onClose={() => {
                    setIsRoomModalOpen(false);
                    setCurrentRoom(null);
                    setCurrentHotel(null);
                }}
                currentReserve={
                    currentRoom && currentHotel
                        ? {
                              hotel: currentHotel,
                              room: currentRoom,
                              reserve: undefined,
                          }
                        : null
                }
            />
        </div>
    );

    if (isInitialLoading && !data) {
        return renderLayout(
            <div className="flex flex-1 items-center justify-center">
                <div className={cx.loaderContainer}>
                    <Loader />
                </div>
            </div>,
        );
    }

    if (hotelsWithRooms.length === 0) {
        return renderLayout(
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
                <PageTitle title={'Все отели'} hotels={0} />
                <NoDataAvailable
                    title="Не найдено ни одной брони"
                    description="Попробуйте изменить условия поиска"
                />
            </div>,
        );
    }

    return renderLayout(
        <div className="flex flex-1 flex-col gap-3">
            <div className="relative">
                <div
                    ref={scrollContainerRef}
                    style={{
                        height: `${virtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {virtualizer.getVirtualItems().map((virtualItem) => {
                        const hotel = hotelsWithRooms[virtualItem.index];
                        if (!hotel) return null;
                        return (
                            <HotelCard
                                key={hotel.id}
                                virtualItem={virtualItem}
                                hotel={hotel}
                                isMobile={isMobile}
                                onHotelClick={onHotelClick}
                                measureElement={virtualizer.measureElement}
                                onHotelInfoClick={onHotelInfoClick}
                                onRoomClick={onRoomClick}
                            />
                        );
                    })}
                </div>
            </div>
            {(isFetchingNextPage || isFilterLoading || isFreeHotelsLoading) && <FullWidthLoader />}
        </div>,
    );
}
