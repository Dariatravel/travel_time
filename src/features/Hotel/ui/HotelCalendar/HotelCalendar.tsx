import { Timeline } from '@/features/BaseCalendar/ui/Timeline';
import { buildTimelineReserveItems } from '@/features/BaseCalendar/lib/reserveMove';
import {
    buildTimelineClosureItems,
    toTimelineBlockEntries,
    type TimelineCalendarItem,
} from '@/features/BaseCalendar/lib/timelineBlocks';
import { useReserveDragMove } from '@/features/BaseCalendar/lib/useReserveDragMove';
import { ReserveMoveConfirmDialog } from '@/features/BaseCalendar/ui/ReserveMoveConfirmDialog';
import { ReserveModal } from '@/features/ReserveInfo/ui/ReserveModal';
import { ClosureEditModal } from '@/features/RoomClosure/ui/ClosureEditModal';
import {
    ClosureModeToolbar,
    type CanvasAction,
} from '@/features/RoomClosure/ui/ClosureModeToolbar';
import { ClosureQuickModal } from '@/features/RoomClosure/ui/ClosureQuickModal';
import { RoomModal } from '@/features/RoomInfo/ui/RoomModal';
import { HotelDTO } from '@/shared/api/hotel/hotel';
import {
    type RoomClosureDTO,
    useCreateRoomClosure,
    useDeleteRoomClosure,
    useRoomClosuresByHotel,
    useUpdateRoomClosure,
} from '@/shared/api/closure/roomClosure';
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
import { getReserveDraftFromTimelineClick, parseTimelineCanvasTime } from '@/features/ReserveInfo/lib/reserveDateForm';
import { devLog } from '@/shared/lib/logger';
import { isRoomClosurePilotHotel } from '@/shared/lib/roomClosurePilot';
import { $hotelsFilter } from '@/shared/models/hotels';
import { $isMobile } from '@/shared/models/mobile';
import { $user } from '@/shared/models/auth';
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useQueryClient } from '@tanstack/react-query';
import { useUnit } from 'effector-react/compat';
import { cloneDeep } from 'lodash';
import { Id } from 'my-react-calendar-timeline';
import { useCallback, useMemo, useRef, useState } from 'react';
import '../../../../app/main/reservation/calendar.scss';
import cx from './style.module.scss';

export interface CalendarProps {
    hotel: HotelDTO;
}

type ClosureDraft = {
    roomId: string;
    roomTitle: string;
    startUnix: number;
    endUnix?: number;
};

export const HotelCalendar = ({ hotel }: CalendarProps) => {
    const [isMobile] = useUnit([$isMobile]);
    const user = useUnit($user);
    const filter = useUnit($hotelsFilter);
    const queryClient = useQueryClient();
    const isClosurePilot = isRoomClosurePilotHotel(hotel.id);
    const userName = user ? `${user.name} ${user.surname}`.trim() : undefined;
    const { data, isPending: isRoomPending } = useGetRoomsWithReservesByHotel(
        hotel.id,
        filter,
        true,
    );
    const { data: roomClosures = [] } = useRoomClosuresByHotel(hotel.id, isClosurePilot);

    const [currentReserve, setCurrentReserve] = useState<Nullable<CurrentReserveType>>(null);
    const [isRoomOpen, setIsRoomOpen] = useState<boolean>(false);
    const [isReserveOpen, setIsReserveOpen] = useState<boolean>(false);
    const [sort, setSort] = useState<'asc' | 'desc'>('asc');
    const [canvasAction, setCanvasAction] = useState<CanvasAction>('booking');
    const [closureDraft, setClosureDraft] = useState<ClosureDraft | null>(null);
    const [editingClosure, setEditingClosure] = useState<RoomClosureDTO | null>(null);
    const blockedEntriesRef = useRef<ReturnType<typeof toTimelineBlockEntries>>([]);

    const {
        isPending: isReserveCreating,
        mutateAsync: createReserve,
        error: reserveError,
    } = useCreateReserve(
        hotel.id, // hotelId
        undefined, // roomId
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
        hotel.id, // hotelId
        undefined, // roomId
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
        hotel.id, // hotelId
        undefined, // roomId
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

    const blockedEntries = useMemo(() => {
        if (!isClosurePilot) {
            return toTimelineBlockEntries(
                hotelReserves.map((item) => ({ ...item, itemKind: 'reserve' as const })),
            );
        }

        return toTimelineBlockEntries([
            ...hotelReserves.map((item) => ({ ...item, itemKind: 'reserve' as const })),
            ...buildTimelineClosureItems(roomClosures),
        ]);
    }, [hotelReserves, isClosurePilot, roomClosures]);

    blockedEntriesRef.current = blockedEntries;

    const getBlockedEntries = useCallback(() => blockedEntriesRef.current, []);

    const closeClosureModals = useCallback(() => {
        setClosureDraft(null);
        setEditingClosure(null);
    }, []);

    const { mutateAsync: createRoomClosure, isPending: isClosureCreating } = useCreateRoomClosure(
        hotel.id,
        getBlockedEntries,
        () => {
            closeClosureModals();
            showToast('Даты закрыты');
        },
    );

    const { mutateAsync: updateRoomClosure, isPending: isClosureUpdating } = useUpdateRoomClosure(
        hotel.id,
        getBlockedEntries,
        () => {
            closeClosureModals();
            showToast('Закрытие обновлено');
        },
    );

    const { mutateAsync: deleteRoomClosure, isPending: isClosureDeleting } = useDeleteRoomClosure(
        hotel.id,
        () => {
            closeClosureModals();
            showToast('Закрытие снято');
        },
    );

    const { displayReserves, handleItemMove, dialogProps } = useReserveDragMove({
        hotelRooms,
        hotelReserves,
        updateReserve,
        isSaving: isReserveUpdating,
    });

    const timelineItems = useMemo((): TimelineCalendarItem[] => {
        if (!isClosurePilot) {
            return displayReserves.map((item) => ({ ...item, itemKind: 'reserve' }));
        }

        const reserveItems = displayReserves.map((item) => ({
            ...item,
            itemKind: 'reserve' as const,
        }));

        return [...reserveItems, ...buildTimelineClosureItems(roomClosures)];
    }, [displayReserves, isClosurePilot, roomClosures]);

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

    const onClosureAdd = (groupId: Id, time: number) => {
        const room = hotelRooms?.find((group) => group.id === groupId);
        if (!room) {
            return;
        }

        const clickDay = parseTimelineCanvasTime(time).startOf('day');

        setClosureDraft({
            roomId: room.id,
            roomTitle: room.title,
            startUnix: clickDay.unix(),
            endUnix: clickDay.clone().add(1, 'day').unix(),
        });
    };

    const onClosureItemClick = (item: TimelineCalendarItem) => {
        const closure = roomClosures.find((entry) => entry.id === item.id);
        if (closure) {
            setEditingClosure(closure);
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
    const closureLoading = isClosureCreating || isClosureUpdating;
    const editingClosureRoomTitle = editingClosure
        ? hotelRooms.find((room) => room.id === editingClosure.room_id)?.title
        : undefined;

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
                {isClosurePilot && (
                    <ClosureModeToolbar value={canvasAction} onChange={setCanvasAction} />
                )}
                <div className={cx.calendar}>
                    <Timeline
                        hotel={hotel}
                        hotelRooms={hotelRooms}
                        hotelReserves={timelineItems}
                        timelineClassName="hotelTimeline"
                        sidebarWidth={isMobile ? 100 : 225}
                        canvasAction={isClosurePilot ? canvasAction : 'booking'}
                        onReserveAdd={onReserveAdd}
                        onClosureAdd={isClosurePilot ? onClosureAdd : undefined}
                        onItemClick={onItemClick}
                        onClosureItemClick={isClosurePilot ? onClosureItemClick : undefined}
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
            {isClosurePilot && (
                <>
                    <ClosureQuickModal
                        isOpen={!!closureDraft}
                        roomTitle={closureDraft?.roomTitle ?? ''}
                        roomId={closureDraft?.roomId ?? ''}
                        startUnix={closureDraft?.startUnix}
                        endUnix={closureDraft?.endUnix}
                        userName={userName}
                        isLoading={closureLoading}
                        onClose={closeClosureModals}
                        onSubmit={(payload) => createRoomClosure(payload)}
                    />
                    <ClosureEditModal
                        isOpen={!!editingClosure}
                        closure={editingClosure}
                        roomTitle={editingClosureRoomTitle}
                        userName={userName}
                        isLoading={closureLoading}
                        isDeleting={isClosureDeleting}
                        onClose={closeClosureModals}
                        onSubmit={(payload) => updateRoomClosure(payload)}
                        onDelete={(id) => deleteRoomClosure(id)}
                    />
                </>
            )}
        </>
    );
};
