import { Timeline } from '@/features/BaseCalendar/ui/Timeline';
import { buildTimelineReserveItems } from '@/features/BaseCalendar/lib/reserveMove';
import { useReserveDragMove } from '@/features/BaseCalendar/lib/useReserveDragMove';
import { ReserveMoveConfirmDialog } from '@/features/BaseCalendar/ui/ReserveMoveConfirmDialog';
import { ReserveModal } from '@/features/ReserveInfo/ui/ReserveModal';
import { getReserveDraftFromTimelineClick } from '@/features/ReserveInfo/lib/reserveDateForm';
import { useRoomClosureCalendar } from '@/features/RoomClosure/lib/useRoomClosureCalendar';
import { ClosureEditModal } from '@/features/RoomClosure/ui/ClosureEditModal';
import { ClosureModeToolbar } from '@/features/RoomClosure/ui/ClosureModeToolbar';
import { ClosureQuickModal } from '@/features/RoomClosure/ui/ClosureQuickModal';
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
    const { data, isPending: isRoomPending } = useGetRoomsWithReservesByHotel(
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
        hotel.id,
        undefined,
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

    const { isPending: isReserveUpdating, mutateAsync: updateReserve } = useUpdateReserve(
        hotel.id,
        undefined,
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

    const { isPending: isReserveDeleting, mutateAsync: deleteReserve } = useDeleteReserve(
        hotel.id,
        undefined,
        () => {
            queryClient.invalidateQueries({
                queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel.id],
            });
            setCurrentReserve(null);
            setIsReserveOpen(false);
        },
    );

    const {
        isPending: isRoomCreating,
        mutate: createRoom,
        error: roomError,
    } = useCreateRoom(
        hotel.id,
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

    const hotelReserves = useMemo(() => buildTimelineReserveItems(data ?? []), [data]);

    const { displayReserves, handleItemMove: handleReserveItemMove, dialogProps, hasPendingMove: hasPendingReserveMove } = useReserveDragMove({
        hotelRooms,
        hotelReserves,
        updateReserve,
        isSaving: isReserveUpdating,
    });

    const {
        canvasAction,
        setCanvasAction,
        timelineItems,
        handleItemMove,
        onClosureAdd,
        onClosureItemClick,
        closureMoveDialogProps,
        closureQuickModal,
        closureEditModal,
    } = useRoomClosureCalendar({
        hotelId: hotel.id,
        hotelRooms,
        hotelReserves,
        displayReserves,
        onReserveItemMove: handleReserveItemMove,
        isReserveMoveSaving: isReserveUpdating,
        hasPendingReserveMove,
    });

    const onReserveAdd = (groupId: Id, time: number, e: React.SyntheticEvent) => {
        const room = hotelRooms?.find((group) => group.id === groupId);
        if (room) {
            setCurrentReserve({
                room,
                hotel,
                reserve: getReserveDraftFromTimelineClick(time),
            });
            setIsReserveOpen(true);
        }
    };

    const onItemClick = (item: ReserveDTO, hotelItem: HotelDTO) => {
        const room = hotelRooms.find((room) => room.id === item?.room_id);
        const sourceReserve = data
            ?.flatMap(({ reserves }) => reserves ?? [])
            .find((reserve) => reserve.id === item.id);

        if (room && sourceReserve) {
            setCurrentReserve({
                room,
                reserve: sourceReserve,
                hotel: hotelItem,
            });
            setIsReserveOpen(true);
        }
    };

    const onCreateRoomClick = () => {
        setCurrentReserve({ hotel: hotel });
        setIsRoomOpen(true);
    };

    const isLoading = isRoomPending || isRoomCreating || isUpdatingOrder;
    const reserveLoading = isReserveCreating || isReserveUpdating;

    const timelineId = `hotel-calendar-${hotel.id}`;

    const handleGroupsReorder = (newOrder: string[]) => {
        devLog('Новый порядок групп в HotelCalendar:', newOrder);
        const rooms = cloneDeep(data);
        const roomsWithNewOrder = newOrder
            .map((roomId, index) => {
                const room = rooms?.find((r) => r.id === roomId);
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
                <ClosureModeToolbar value={canvasAction} onChange={setCanvasAction} />
                <div className={cx.calendar}>
                    <Timeline
                        hotel={hotel}
                        hotelRooms={hotelRooms}
                        hotelReserves={timelineItems}
                        timelineClassName="hotelTimeline"
                        sidebarWidth={isMobile ? 100 : 225}
                        canvasAction={canvasAction}
                        onReserveAdd={onReserveAdd}
                        onClosureAdd={onClosureAdd}
                        onItemClick={onItemClick}
                        onClosureItemClick={onClosureItemClick}
                        onCreateRoom={onCreateRoomClick}
                        calendarItemClassName={cx.calendarItem}
                        timelineId={timelineId}
                        onGroupsReorder={handleGroupsReorder}
                        onItemMove={handleItemMove}
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
            {dialogProps && <ReserveMoveConfirmDialog {...dialogProps} />}
            {closureMoveDialogProps && <ReserveMoveConfirmDialog {...closureMoveDialogProps} />}
            <ClosureQuickModal {...closureQuickModal} />
            <ClosureEditModal {...closureEditModal} />
        </>
    );
};
