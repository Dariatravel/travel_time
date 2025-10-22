import { Timeline } from '@/features/BaseCalendar/ui/Timeline';
import { ReserveModal } from '@/features/ReserveInfo/ui/ReserveModal';
import { RoomModal } from '@/features/RoomInfo/ui/RoomModal';
import { HotelDTO } from '@/shared/api/hotel/hotel';
import {
    CurrentReserveType,
    Nullable,
    Reserve,
    ReserveDTO,
    useCreateReserve,
    useDeleteReserve,
    useUpdateReserve,
} from '@/shared/api/reserve/reserve';
import {
    Room,
    RoomDTO,
    useCreateRoom,
    useGetRoomsWithReservesByHotel,
    useUpdateRoomOrder,
} from '@/shared/api/room/room';
import { QUERY_KEYS } from '@/shared/config/reactQuery';
import { getDateFromUnix } from '@/shared/lib/date';
import { devLog } from '@/shared/lib/logger';
import { $hotelsFilter } from '@/shared/models/hotels';
import { $isMobile } from '@/shared/models/mobile';
import { Loader } from '@/shared/ui/Loader/Loader';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useQueryClient } from '@tanstack/react-query';
import { useUnit } from 'effector-react/compat';
import { Id } from 'my-react-calendar-timeline';

import { cn } from '@/lib/utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import '../../../app/main/reservation/calendar.scss';
import cx from './style.module.scss';

export interface CalendarProps {
    hotel: HotelDTO;
    onHotelClick?: (hotel_id: string) => void;
}

export const Calendar = ({ hotel, onHotelClick }: CalendarProps) => {
    const [isMobile] = useUnit([$isMobile]);
    const filter = useUnit($hotelsFilter);
    const queryClient = useQueryClient();
    const {
        data,
        // isFetching: isRoomLoading,
        // isLoading: isRoomLoading,
        isPending: isRoomLoading,
        isFetching: isRoomFetching,
        refetch,
    } = useGetRoomsWithReservesByHotel(hotel.id, filter, true);

    useEffect(() => {
        refetch();
    }, [filter, refetch]);

    const [currentReserve, setCurrentReserve] = useState<Nullable<CurrentReserveType>>(null);
    const [isRoomOpen, setIsRoomOpen] = useState<boolean>(false);
    const [isReserveOpen, setIsReserveOpen] = useState<boolean>(false);
    const [sort, setSort] = useState<'asc' | 'desc'>('asc');

    const {
        isPending: isReserveCreating,
        mutateAsync: createReserve,
        error: reserveError,
    } = useCreateReserve(
        () => {
            queryClient.invalidateQueries({
                queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel.id],
            });
            setCurrentReserve(null);
            setIsReserveOpen(false);
        },
        (e) => {
            showToast(`Ошибка при обновлении брони ${e}`, 'error');
        },
    );

    const { isPending: isReserveUpdating, mutate: updateReserve } = useUpdateReserve(
        () => {
            queryClient.invalidateQueries({
                queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel.id],
            });
            setCurrentReserve(null);
            setIsReserveOpen(false);
        },
        (e) => {
            showToast('Ошибка при обновлении брони', 'error');
        },
    );

    const { isPending: isReserveDeleting, mutateAsync: deleteReserve } = useDeleteReserve(() => {
        queryClient.invalidateQueries({
            queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel.id],
        });
        setCurrentReserve(null);
        setIsReserveOpen(false);
    });

    const {
        isPending: isRoomCreating,
        mutate: createRoom,
        error: roomError,
    } = useCreateRoom(
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

    const onReserveAccept = async (reserve: Reserve) => {
        const isEdit = currentReserve?.reserve?.id;

        if (isEdit) {
            devLog('Пытаюсь обновить запись');
            await updateReserve(reserve as ReserveDTO);

            return;
        }

        await createReserve(reserve);
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
    }, [data, sort]);

    let hotelReserves: Array<ReserveDTO & { group: string }> = [];

    data?.forEach(({ id: room_id, reserves }) => {
        const reservesTmp = reserves.map(({ end, start, ...reserve }) => ({
            ...reserve,
            id: reserve.id,
            group: room_id,
            end: getDateFromUnix(end),
            start: getDateFromUnix(start),
        }));

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        hotelReserves = hotelReserves.concat(reservesTmp);
    });

    const onReserveAdd = (groupId: Id, time: number, e: React.SyntheticEvent) => {
        const room = hotelRooms?.find((group) => group.id === groupId);
        if (room) {
            setCurrentReserve({
                room,
                hotel,
                reserve: {
                    start: time,
                    end: getDateFromUnix(time).add(1, 'day').unix(),
                },
            });
            setIsReserveOpen(true);
        }
    };

    const onItemClick = (reserve: ReserveDTO, hotel: HotelDTO) => {
        const room = hotelRooms.find((room) => room.id === reserve?.room_id);

        if (room) {
            setCurrentReserve({ room, reserve, hotel });
            setIsReserveOpen(true);
        }
    };

    const onCreate = () => {
        setCurrentReserve({ hotel: hotel });
        setIsReserveOpen(true);
    };

    const sidebarWidth = useMemo(() => (isMobile ? 100 : 230), [isMobile]);

    const isLoading = isRoomLoading || isRoomCreating || isUpdatingOrder || isRoomFetching;
    const reserveLoading = isReserveCreating || isReserveUpdating;

    console.log({ ['ROOMSLOADING']: isLoading });
    // Показываем лоадер во время загрузки, даже если данных нет
    if (isLoading) {
        return (
            <div style={{ position: 'relative' }} className="p-4">
                <div
                    className={cn(
                        cx.container,
                        'flex gap-2 items-center justify-center',
                        isMobile && 'flex-col',
                    )}
                >
                    <Loader size="s" />
                    {/* <FullWidthLoader /> */}
                </div>
            </div>
        );
    }

    // Возвращаем null только если данные загружены, но пустые
    const isEmpty = !hotelRooms?.length;
    if (isEmpty) {
        return null;
    }

    // Уникальный ID для этого Timeline
    const timelineId = `calendar-${hotel.id}`;

    const handleGroupsReorder = (newOrder: string[]) => {
        devLog('Новый порядок групп:', newOrder);
        // Формируем новый массив RoomDTO с актуальным порядком
        const roomsWithNewOrder = newOrder
            .map((roomId, index) => {
                const room = hotelRooms.find((r) => r.id === roomId);
                return room ? { ...room, order: index } : null;
            })
            .filter((room) => room !== null) as RoomDTO[];
        updateRoomOrder({ hotelId: hotel.id, rooms: roomsWithNewOrder });
    };

    return (
        <div style={{ position: 'relative' }} className="p-0">
            <div className={cn(cx.container, 'flex flex-col gap-2', isMobile && 'flex-col')}>
                <div className={cx.calendarContainer}>
                    <Timeline
                        hotel={hotel}
                        hotelRooms={hotelRooms}
                        hotelReserves={hotelReserves}
                        timelineClassName="travel-timeline"
                        sidebarWidth={sidebarWidth}
                        onReserveAdd={onReserveAdd}
                        onItemClick={onItemClick}
                        onCreateRoom={onCreate}
                        calendarItemClassName={cx.calendarItem}
                        timelineId={timelineId}
                        onGroupsReorder={handleGroupsReorder}
                    />
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
        </div>
    );
};
