import { Timeline } from '@/features/BaseCalendar/ui/Timeline';
import { buildTimelineReserveItems, toReserveUnix } from '@/features/BaseCalendar/lib/reserveMove';
import { useReserveDragMove } from '@/features/BaseCalendar/lib/useReserveDragMove';
import { ReserveMoveConfirmDialog } from '@/features/BaseCalendar/ui/ReserveMoveConfirmDialog';
import { ReserveModal } from '@/features/ReserveInfo/ui/ReserveModal';
import { RoomModal } from '@/features/RoomInfo/ui/RoomModal';
import { HotelDTO, HotelRoomsReservesDTO } from '@/shared/api/hotel/hotel';
import {
    CurrentReserveType,
    Nullable,
    Reserve,
    ReserveDTO,
    useCreateReserve,
    useDeleteReserve,
    useUpdateReserve,
} from '@/shared/api/reserve/reserve';
import { Room, RoomDTO, useCreateRoom, useUpdateRoomOrder } from '@/shared/api/room/room';
import { QUERY_KEYS } from '@/shared/config/reactQuery';
import { devLog } from '@/shared/lib/logger';
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useQueryClient } from '@tanstack/react-query';
import { Id } from 'my-react-calendar-timeline';

import { cn } from '@/lib/utils';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import '../../../app/main/reservation/calendar.scss';
import cx from './style.module.scss';

export interface CalendarProps {
    hotel: HotelRoomsReservesDTO;
    /** Период поиска (unix, сек). Если задан — календарь покажет этот интервал. */
    visibleTimeStart?: number;
    visibleTimeEnd?: number;
    onHotelClick?: (hotel_id: string) => void;
    onRoomClick?: (room: RoomDTO) => void;
    isLoading?: boolean;
}

export const Calendar = ({
    hotel,
    visibleTimeStart,
    visibleTimeEnd,
    onHotelClick,
    onRoomClick,
    isLoading,
}: CalendarProps) => {
    const { isMobile, isPhone } = useScreenSize();
    const queryClient = useQueryClient();

    // Сортируем номера по полю order
    const data = useMemo(() => {
        const rooms = hotel.rooms || [];
        return [...rooms].sort((a, b) => {
            const orderA = a.order ?? 999;
            const orderB = b.order ?? 999;
            return orderA - orderB;
        });
    }, [hotel.rooms]);

    const [currentReserve, setCurrentReserve] = useState<Nullable<CurrentReserveType>>(null);
    const [isRoomOpen, setIsRoomOpen] = useState<boolean>(false);
    const [isReserveOpen, setIsReserveOpen] = useState<boolean>(false);

    const {
        isPending: isReserveCreating,
        mutateAsync: createReserve,
        error: reserveError,
    } = useCreateReserve(
        hotel.id, // hotelId
        currentReserve?.room?.id, // roomId - будет обновляться при изменении currentReserve
        () => {
            // Оптимистичное обновление уже выполнено в мутации
            setCurrentReserve(null);
            setIsReserveOpen(false);
            showToast('Бронь успешно создана');
        },
        (e: Error) => {
            showToast(`Ошибка при создании брони ${e.message}`, 'error');
        },
    );

    const { isPending: isReserveUpdating, mutateAsync: updateReserve } = useUpdateReserve(
        hotel.id, // hotelId
        currentReserve?.room?.id, // roomId
        () => {
            // Оптимистичное обновление уже выполнено в мутации
            setCurrentReserve(null);
            setIsReserveOpen(false);
            showToast('Бронь успешно обновлена');
        },
        (e: Error) => {
            showToast(`Ошибка при обновлении брони ${e.message}`, 'error');
        },
    );

    const { isPending: isReserveDeleting, mutateAsync: deleteReserve } = useDeleteReserve(
        hotel.id, // hotelId
        currentReserve?.reserve?.room_id, // roomId из резерва
        () => {
            // Оптимистичное обновление уже выполнено в мутации
            setCurrentReserve(null);
            setIsReserveOpen(false);
            showToast('Бронь успешно удалена');
        },
        (e: Error) => {
            showToast(`Ошибка при удалении брони ${e.message}`, 'error');
        },
    );

    const {
        isPending: isRoomCreating,
        mutate: createRoom,
        error: roomError,
    } = useCreateRoom(
        hotel.id, // hotelId
        () => {
            queryClient.invalidateQueries({
                queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel.id],
            });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.roomsByHotel });
            setCurrentReserve(null);
            setIsRoomOpen(false);
            showToast('Номер успешно добавлен');
        },
        (e) => {
            showToast(`Ошибка при добавлении номера ${e}`, 'error');
        },
    );

    const { mutate: updateRoomOrder, isPending: isUpdatingOrder } = useUpdateRoomOrder(
        () => {
            showToast('Порядок номеров успешно обновлен');
        },
        (error) => {
            showToast(`Ошибка при обновлении порядка номеров: ${error}`, 'error');
        },
    );

    const onRoomCreate = useCallback((room: Room) => {
        createRoom(room);
        devLog('Создаю ROOM', room);
    }, []);

    const onReserveAccept = async (reserve: Reserve | ReserveDTO) => {
        if ('id' in reserve && reserve.id) {
            devLog('Пытаюсь обновить запись');
            await updateReserve(reserve as ReserveDTO);

            return;
        }

        await createReserve(reserve as Reserve);
    };

    const onReserveDelete = async (id: string) => {
        devLog('Пытаюсь удалить запись');
        await deleteReserve(id);

        return;
    };

    const onClose = () => {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.hotelsForRoom] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.roomsByHotel] });
        setIsReserveOpen(false);
        setCurrentReserve(null);
    };

    const hotelRooms = useMemo(() => {
        const rooms =
            data?.map(({ reserves, id, title, ...room }) => ({
                id,
                title: `${title}`,
                ...room,
            })) ?? [];

        return rooms;
    }, [data]); // Убираем sort из зависимостей, так как он не используется

    const hotelReserves = useMemo(() => buildTimelineReserveItems(data ?? []), [data]);

    const { displayReserves, handleItemMove, dialogProps } = useReserveDragMove({
        hotelRooms,
        hotelReserves,
        updateReserve,
        isSaving: isReserveUpdating,
    });

    const onReserveAdd = (groupId: Id, time: number, e: React.SyntheticEvent) => {
        const room = hotelRooms?.find((group) => group.id === groupId);

        if (room) {
            setCurrentReserve({
                room,
                hotel,
                reserve: {
                    start: moment(time).startOf('day').toDate(),
                    end: moment(time).add(1, 'day').startOf('day').toDate(),
                },
            });
            setIsReserveOpen(true);
        }
    };

    const onItemClick = (reserve: ReserveDTO, hotelItem: HotelDTO) => {
        const room = hotelRooms.find((room) => room.id === reserve?.room_id);

        if (room) {
            setCurrentReserve({
                room,
                reserve: {
                    ...reserve,
                    start: toReserveUnix(reserve.start),
                    end: toReserveUnix(reserve.end),
                },
                hotel: hotelItem,
            });
            setIsReserveOpen(true);
        }
    };

    const onCreate = () => {
        setCurrentReserve({ hotel: hotel });
        setIsRoomOpen(true);
    };

    const sidebarWidth = useMemo(() => (isPhone ? 104 : isMobile ? 100 : 190), [isMobile, isPhone]);

    const isLoadingCalendar = isRoomCreating || isUpdatingOrder || isLoading;
    const reserveLoading = isReserveCreating || isReserveUpdating || isReserveDeleting;
    const shouldDimCalendar = (reserveLoading || isLoadingCalendar) && !isReserveOpen;

    // Возвращаем null только если данные загружены, но пустые
    const isEmpty = !hotelRooms?.length;
    if (isEmpty) {
        return null;
    }

    // Уникальный ID для этого Timeline
    const timelineId = `calendar-${hotel.id}`;

    const handleGroupsReorder = async (newOrder: string[]) => {
        devLog('Новый порядок групп:', newOrder);
        // Формируем новый массив RoomDTO с актуальным порядком
        const roomsWithNewOrder = newOrder
            .map((roomId, index) => {
                const room = hotelRooms.find((r) => r.id === roomId);
                return room ? { ...room, order: index } : null;
            })
            .filter((room) => room !== null) as RoomDTO[];
        updateRoomOrder({ hotelId: hotel.id, rooms: roomsWithNewOrder });
        // После обновления порядка групп обновляем списки
        await queryClient.invalidateQueries({ queryKey: ['hotels', 'list'] });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.roomsByHotel });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.roomsWithReservesByHotel });
    };

    return (
        <div style={{ position: 'relative' }} className="p-0">
            <div className={cn(cx.container, 'flex flex-col gap-2', isMobile && 'flex-col')}>
                <div className={cn(cx.calendarContainer, 'relative')}>
                    {(reserveLoading || isLoadingCalendar) && !isReserveOpen && <FullWidthLoader />}
                    <div
                        className={cn(
                            shouldDimCalendar && 'opacity-50 pointer-events-none',
                        )}
                    >
                        <Timeline
                            hotel={hotel}
                            hotelRooms={hotelRooms}
                            hotelReserves={displayReserves}
                            visibleTimeStart={visibleTimeStart}
                            visibleTimeEnd={visibleTimeEnd}
                            timelineClassName="travel-timeline"
                            sidebarWidth={sidebarWidth}
                            onReserveAdd={onReserveAdd}
                            onItemClick={onItemClick}
                            onGroupClick={onRoomClick}
                            onCreateRoom={onCreate}
                            calendarItemClassName={cx.calendarItem}
                            timelineId={timelineId}
                            onGroupsReorder={handleGroupsReorder}
                            onItemMove={handleItemMove}
                        />
                    </div>
                </div>
            </div>
            <RoomModal
                isOpen={isRoomOpen}
                onClose={() => setIsRoomOpen(false)}
                onAccept={(room: unknown) => onRoomCreate(room as Room)}
                isLoading={isRoomCreating}
                currentReserve={currentReserve}
            />
            <ReserveModal
                isOpen={isReserveOpen}
                onClose={onClose}
                onAccept={(reserve: unknown) => onReserveAccept(reserve as Reserve)}
                onDelete={onReserveDelete}
                currentReserve={currentReserve}
                isLoading={reserveLoading}
            />
            {dialogProps && <ReserveMoveConfirmDialog {...dialogProps} />}
        </div>
    );
};
