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
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useQueryClient } from '@tanstack/react-query';
import { useUnit } from 'effector-react/compat';
import { cloneDeep } from 'lodash';
import { Id } from 'my-react-calendar-timeline';
import { useCallback, useMemo, useState } from 'react';
import '../../../../app/main/reservation/calendar.scss';
import cx from './style.module.scss';

export interface CalendarProps {
    hotel: HotelDTO;
}

export const HotelCalendar = ({ hotel }: CalendarProps) => {
    const [isMobile] = useUnit([$isMobile]);
    const filter = useUnit($hotelsFilter);
    const queryClient = useQueryClient();
    const { data, isFetching: isRoomLoading } = useGetRoomsWithReservesByHotel(
        hotel.id,
        filter,
        true,
    );

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

    const onCreateRoomClick = () => {
        setCurrentReserve({ hotel: hotel });
        setIsRoomOpen(true);
    };

    const isLoading = isRoomLoading || isRoomCreating || isUpdatingOrder;
    const reserveLoading = isReserveCreating || isReserveUpdating;

    // Уникальный ID для этого Timeline
    const timelineId = `hotel-calendar-${hotel.id}`;

    const handleGroupsReorder = (newOrder: string[]) => {
        devLog('Новый порядок групп в HotelCalendar:', newOrder);
        const rooms = cloneDeep(data);
        // Формируем новый массив RoomDTO с актуальным порядком
        const roomsWithNewOrder = newOrder
            .map((roomId, index) => {
                const room = rooms?.find((r) => r.id === roomId);
                /**
                 * Удаляем поле reserves из объекта room, чтобы избежать мутаций и ошибок типов.
                 * Вместо delete используем деструктуризацию, чтобы создать новый объект без поля reserves.
                 */
                if (!room) return null;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { reserves, ...roomWithoutReserves } = room;
                return { ...roomWithoutReserves, order: index };
            })
            .filter((room) => room !== null) as RoomDTO[];
        devLog('', roomsWithNewOrder);
        updateRoomOrder({ hotelId: hotel.id, rooms: roomsWithNewOrder });
    };

    return (
        <>
            <div>
                {isLoading && <FullWidthLoader />}
                <div className={cx.hotelInfo}></div>
                <div className={cx.calendar}>
                    <Timeline
                        hotel={hotel}
                        hotelRooms={hotelRooms}
                        hotelReserves={hotelReserves}
                        timelineClassName="hotelTimeline"
                        sidebarWidth={isMobile ? 100 : 225}
                        onReserveAdd={onReserveAdd}
                        onItemClick={onItemClick}
                        onCreateRoom={onCreateRoomClick}
                        calendarItemClassName={cx.calendarItem}
                        timelineId={timelineId}
                        onGroupsReorder={handleGroupsReorder}
                    />
                </div>
                <RoomModal
                    isOpen={isRoomOpen}
                    onClose={() => setIsRoomOpen(false)}
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-expect-error
                    onAccept={onRoomCreate}
                    isLoading={isRoomCreating}
                    currentReserve={currentReserve}
                />
            </div>
            <ReserveModal
                isOpen={isReserveOpen}
                onClose={onClose}
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-expect-error
                onAccept={onReserveAccept}
                onDelete={onReserveDelete}
                currentReserve={currentReserve}
                isLoading={reserveLoading}
            />
        </>
    );
};
