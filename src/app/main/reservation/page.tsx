'use client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NoDataAvailable } from '@/components/ui/empty-state';
import { VALUE_TO_LABEL_MAP } from '@/features/AdvancedFilters/lib/constants';
import {
    TIMELINE_HEADER_ROWS_ESTIMATE,
    TIMELINE_MOBILE_CONTROLS_ESTIMATE,
    TIMELINE_ROW_HEIGHT,
} from '@/features/BaseCalendar/lib/timelineLayout';
import { Calendar } from '@/features/Calendar';
import { HotelModal } from '@/features/HotelModal/ui/HotelModal';
import { $isHotelsWithFreeRoomsLoading } from '@/features/Reservation/model/reservationStore';
import { RoomModal } from '@/features/RoomInfo/ui/RoomModal';
import { SearchForm } from '@/features/Search';
import { FullWidthLoader, Loader } from '@/shared';
import {
    HotelRoomsReservesDTO,
    useHotelDetailQuery,
    useInfiniteHotelsQuery,
} from '@/shared/api/hotel/hotel';
import { RoomDTO } from '@/shared/api/room/room';
import { routes } from '@/shared/config/routes';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { $hotelsFilter } from '@/shared/models/hotels';
import { HotelTelegram } from '@/shared/ui/Hotel/HotelTelegram';
import { HotelTitle } from '@/shared/ui/Hotel/HotelTitle';
import { getHotelUrl } from '@/utils/getHotelUrl';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useUnit } from 'effector-react/compat';
import { MapPin } from 'lucide-react';
import 'my-react-calendar-timeline/style.css';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMainScrollElement } from '../MainScrollContext';
import './calendar.scss';
import cx from './page.module.css';

// Мемоизированный компонент карточки отеля для оптимизации виртуализации
const HotelCard = ({
    virtualItem,
    hotel,
    isMobile,
    onHotelClick,
    onHotelInfoClick,
    onRoomClick,
    measureElement,
    allowedRooms,
    visibleTimeStart,
    visibleTimeEnd,
}: {
    virtualItem: { index: number; start: number; size: number };
    hotel: HotelRoomsReservesDTO;
    isMobile: boolean;
    onHotelClick?: (hotel_id: string) => void;
    onHotelInfoClick?: (hotel: HotelRoomsReservesDTO) => void;
    onRoomClick?: (room: RoomDTO, hotel: HotelRoomsReservesDTO) => void;
    measureElement: (element: Element | null) => void;
    allowedRooms?: string[];
    visibleTimeStart?: number;
    visibleTimeEnd?: number;
}) => {
    const elementRef = useRef<HTMLDivElement>(null);

    // Загружаем детальные данные конкретного отеля (с автообновлением при изменениях)
    // Передаём allowedRooms для фильтрации номеров
    const { data: hotelDetail, isLoading: isHotelDetailLoading } = useHotelDetailQuery(
        hotel.id,
        allowedRooms,
    );

    // Используем детальные данные если они загружены, иначе базовые из списка
    const hotelData = hotelDetail || hotel;

    // Измеряем реальную высоту элемента: таймлайн и данные номеров могут менять высоту после первого рендера.
    useEffect(() => {
        if (!elementRef.current) return;

        const element = elementRef.current;
        const measure = () => {
            measureElement(element);
        };

        const t0 = requestAnimationFrame(measure);
        const resizeObserver = new ResizeObserver(measure);
        resizeObserver.observe(element);

        return () => {
            cancelAnimationFrame(t0);
            resizeObserver.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hotelData.rooms?.length, isHotelDetailLoading, hotel.id]);

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
            className="p-0"
        >
            <Card className="h-full p-0">
                <CardHeader className="p-0">
                    <CardTitle>
                        <div className="space-y-2 p-3 sm:p-4">
                            <div className="space-y-1">
                                {/* Ранее здесь отображался тип отеля (hotelData.type),
                                    но тип перенесён на уровень номера (room.type),
                                    поэтому бейдж типа для отеля убран. */}
                                <div className="flex items-center gap-2">
                                    <HotelTitle
                                        size={isMobile ? 's' : 'xl'}
                                        href={getHotelUrl(hotelData)}
                                        className="text-sm font-semibold text-zinc-600 sm:text-xl"
                                    >
                                        {hotelData?.title}
                                    </HotelTitle>
                                    <div className="flex items-center gap-2">
                                        {hotelData?.telegram_url && (
                                            <HotelTelegram url={hotelData?.telegram_url} />
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-3 text-xs"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onHotelInfoClick?.(hotelData);
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
                                    {getHotelCity(hotelData?.city)}
                                </div>
                                <div className="min-w-0 flex-1 break-words text-foreground/80">
                                    Адрес: {hotelData?.address}
                                </div>
                            </div>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Calendar
                        isLoading={isHotelDetailLoading}
                        hotel={hotelData}
                        visibleTimeStart={visibleTimeStart}
                        visibleTimeEnd={visibleTimeEnd}
                        onHotelClick={onHotelClick}
                        onRoomClick={(room) => {
                            // Вызываем обработчик из родительского компонента
                            onRoomClick?.(room, hotelData);
                        }}
                    />
                </CardContent>
            </Card>
        </div>
    );
};

export default function Home() {
    const router = useRouter();
    const { isMobile, isPhone } = useScreenSize();
    const mainScrollEl = useMainScrollElement();

    /** На мобилке/планшете скролл в MainLayout — div.content; на десктопе — documentElement. */
    const getScrollElement = useCallback(() => {
        if (typeof document === 'undefined') return null;
        if (isMobile && mainScrollEl) return mainScrollEl;
        return document.documentElement;
    }, [isMobile, mainScrollEl]);

    const [isHotelModalOpen, setIsHotelModalOpen] = useState(false);
    const [currentHotel, setCurrentHotel] = useState<HotelRoomsReservesDTO | null>(null);
    const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
    const [currentRoom, setCurrentRoom] = useState<RoomDTO | null>(null);

    const filter = useUnit($hotelsFilter);
    const isFreeHotelsLoading = useUnit($isHotelsWithFreeRoomsLoading);
    const isFilterLoading = filter?.isLoading ?? false;

    const scrollContainerRef = useRef<HTMLDivElement>(null); // оставляем для совместимости измерений, но не используем как скролл-элемент
    /** Страницы API: слишком мелкий размер даёт много запросов; «два отеля и стоп» бывает, если нет скролла и не вызывается fetchNextPage. */
    const PAGE_SIZE = 12;

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } =
        useInfiniteHotelsQuery(filter, PAGE_SIZE);

    const hotels = data?.pages.flatMap((page) => page.data) ?? [];
    const hotelsWithRooms = hotels?.filter((hotel) => hotel?.rooms?.length > 0);

    // Виртуализатор: scroll element = .content на узком layout, иначе window (documentElement)
    const virtualizer = useVirtualizer({
        count: hotelsWithRooms.length,
        getScrollElement,
        estimateSize: (index) => {
            const hotel = hotelsWithRooms[index];
            if (!hotel) return isPhone ? 520 : 400;

            const roomsCount = hotel.rooms?.length || 1;
            const rowHeight = isPhone
                ? TIMELINE_ROW_HEIGHT.phone
                : isMobile
                  ? TIMELINE_ROW_HEIGHT.tablet
                  : TIMELINE_ROW_HEIGHT.desktop;
            const gap = 12;

            /* Телефон: таймлайн растёт по числу номеров, поэтому оценка использует тот же rowHeight, что и Timeline.lineHeight. */
            if (isPhone) {
                const headerBlock = 200;
                const calendarBody =
                    TIMELINE_MOBILE_CONTROLS_ESTIMATE +
                    TIMELINE_HEADER_ROWS_ESTIMATE +
                    roomsCount * rowHeight +
                    24;
                return headerBlock + calendarBody + gap;
            }

            const headerHeight = 80;
            const paddingMargin = 20;
            const calendarHeight = Math.min(
                250,
                Math.max(150, roomsCount * rowHeight + 60),
            );

            return headerHeight + paddingMargin + calendarHeight + gap;
        },
        overscan: 1,
    });

    // Подгрузка при прокрутке: на десктопе скроллится окно — вешаемся на window; на планшете/телефоне — на .content из layout.
    useEffect(() => {
        if (hotelsWithRooms.length === 0) return;

        const scrollTarget: EventTarget =
            isMobile && mainScrollEl ? mainScrollEl : window;

        let lastCheckTime = 0;
        const THROTTLE_MS = 200; // Throttle для проверки конца списка

        const checkLoadMore = () => {
            const now = Date.now();
            if (now - lastCheckTime < THROTTLE_MS) return;
            lastCheckTime = now;

            if (!hasNextPage || isFetchingNextPage) return;

            const virtualItems = virtualizer.getVirtualItems();
            if (virtualItems.length === 0) return;

            const lastItem = virtualItems[virtualItems.length - 1];
            if (!lastItem) return;

            // Проверяем, дошли ли до конца видимых элементов
            const isNearEnd = lastItem.index >= hotelsWithRooms.length - 2;

            if (isNearEnd) {
                void fetchNextPage();
            }
        };

        let rafId: number | null = null;
        const handleScroll = () => {
            if (rafId === null) {
                rafId = window.requestAnimationFrame(() => {
                    checkLoadMore();
                    rafId = null;
                });
            }
        };

        scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            scrollTarget.removeEventListener('scroll', handleScroll);
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
            }
        };
    }, [
        isMobile,
        mainScrollEl,
        hotelsWithRooms.length,
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
        virtualizer,
    ]);

    /**
     * Если первые страницы помещаются во вьюпорт, событие scroll не возникает — догружаем, пока появится скролл или закончится hasNextPage.
     */
    useEffect(() => {
        if (!hasNextPage || isFetchingNextPage || hotelsWithRooms.length === 0) return;

        const scrollEl = getScrollElement();
        if (!scrollEl) return;

        const lacksVerticalScroll = scrollEl.scrollHeight <= scrollEl.clientHeight + 8;
        if (!lacksVerticalScroll) return;

        void fetchNextPage();
    }, [
        hasNextPage,
        isFetchingNextPage,
        hotelsWithRooms.length,
        getScrollElement,
        fetchNextPage,
        data?.pages.length,
    ]);

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
                {/* <PageTitle title={'Все отели'} hotels={0} /> */}
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

                        // Извлекаем разрешённые номера для этого отеля из фильтра
                        const allowedRooms = filter?.freeHotels?.get(hotel.id);

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
                                allowedRooms={allowedRooms}
                                visibleTimeStart={filter?.start}
                                visibleTimeEnd={filter?.end}
                            />
                        );
                    })}
                </div>
            </div>
            {(isFetchingNextPage || isFilterLoading || isFreeHotelsLoading) && <FullWidthLoader />}
        </div>,
    );
}
