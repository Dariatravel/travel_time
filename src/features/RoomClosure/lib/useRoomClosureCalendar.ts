'use client';

import { TimelineReserveItem } from '@/features/BaseCalendar/lib/reserveMove';
import {
    buildTimelineClosureItems,
    toTimelineBlockEntries,
    type TimelineCalendarItem,
} from '@/features/BaseCalendar/lib/timelineBlocks';
import { useClosureDragMove } from '@/features/RoomClosure/lib/useClosureDragMove';
import { parseTimelineCanvasTime } from '@/features/ReserveInfo/lib/reserveDateForm';
import type { CanvasAction } from '@/features/RoomClosure/ui/ClosureModeToolbar';
import {
    type RoomClosureDTO,
    useCreateRoomClosure,
    useDeleteRoomClosure,
    useRoomClosuresByHotel,
    useUpdateRoomClosure,
} from '@/shared/api/closure/roomClosure';
import { $user } from '@/shared/models/auth';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useUnit } from 'effector-react/compat';
import { Id } from 'my-react-calendar-timeline';
import { useCallback, useMemo, useRef, useState } from 'react';

type RoomOption = {
    id: string;
    title: string;
};

type ClosureDraft = {
    roomId: string;
    roomTitle: string;
    startUnix: number;
    endUnix?: number;
};

type UseRoomClosureCalendarParams = {
    hotelId: string;
    hotelRooms: RoomOption[];
    hotelReserves: TimelineReserveItem[];
    displayReserves: TimelineReserveItem[];
    onReserveItemMove: (itemId: Id, dragTime: number, newGroupOrder: number) => void;
    isReserveMoveSaving?: boolean;
    hasPendingReserveMove?: boolean;
};

export const useRoomClosureCalendar = ({
    hotelId,
    hotelRooms,
    hotelReserves,
    displayReserves,
    onReserveItemMove,
    isReserveMoveSaving = false,
    hasPendingReserveMove = false,
}: UseRoomClosureCalendarParams) => {
    const user = useUnit($user);
    const userName = user ? `${user.name} ${user.surname}`.trim() : undefined;
    const { data: roomClosures = [], isLoading: isRoomClosuresLoading } =
        useRoomClosuresByHotel(hotelId);

    const [canvasAction, setCanvasAction] = useState<CanvasAction>('booking');
    const [closureDraft, setClosureDraft] = useState<ClosureDraft | null>(null);
    const [editingClosure, setEditingClosure] = useState<RoomClosureDTO | null>(null);
    const blockedEntriesRef = useRef<ReturnType<typeof toTimelineBlockEntries>>([]);

    const blockedEntries = useMemo(
        () =>
            toTimelineBlockEntries([
                ...hotelReserves.map((item) => ({ ...item, itemKind: 'reserve' as const })),
                ...buildTimelineClosureItems(roomClosures),
            ]),
        [hotelReserves, roomClosures],
    );

    blockedEntriesRef.current = blockedEntries;

    const getBlockedEntries = useCallback(() => blockedEntriesRef.current, []);

    const closeClosureModals = useCallback(() => {
        setClosureDraft(null);
        setEditingClosure(null);
    }, []);

    const { mutateAsync: createRoomClosure, isPending: isClosureCreating } = useCreateRoomClosure(
        hotelId,
        getBlockedEntries,
        () => {
            closeClosureModals();
            showToast('Даты закрыты');
        },
    );

    const { mutateAsync: updateRoomClosure, isPending: isClosureUpdating } = useUpdateRoomClosure(
        hotelId,
        getBlockedEntries,
        () => {
            closeClosureModals();
            showToast('Закрытие обновлено');
        },
    );

    const { mutateAsync: deleteRoomClosure, isPending: isClosureDeleting } = useDeleteRoomClosure(
        hotelId,
        () => {
            closeClosureModals();
            showToast('Закрытие снято');
        },
    );

    const {
        displayClosures,
        handleClosureItemMove,
        dialogProps: closureMoveDialogProps,
        hasPendingMove: hasPendingClosureMove,
    } = useClosureDragMove({
        hotelRooms,
        roomClosures,
        getBlockedEntries,
        updateRoomClosure,
        isSaving: isClosureUpdating,
    });

    const timelineItems = useMemo((): TimelineCalendarItem[] => {
        const reserveItems = displayReserves.map((item) => ({
            ...item,
            itemKind: 'reserve' as const,
        }));

        return [...reserveItems, ...buildTimelineClosureItems(displayClosures)];
    }, [displayClosures, displayReserves]);

    const handleItemMove = useCallback(
        (itemId: Id, dragTime: number, newGroupOrder: number) => {
            if (hasPendingReserveMove || hasPendingClosureMove) {
                return;
            }

            if (roomClosures.some((closure) => closure.id === itemId)) {
                handleClosureItemMove(itemId, dragTime, newGroupOrder);
                return;
            }

            onReserveItemMove(itemId, dragTime, newGroupOrder);
        },
        [
            handleClosureItemMove,
            hasPendingClosureMove,
            hasPendingReserveMove,
            onReserveItemMove,
            roomClosures,
        ],
    );

    const onClosureAdd = useCallback(
        (groupId: Id, time: number) => {
            const room = hotelRooms.find((group) => group.id === groupId);
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
        },
        [hotelRooms],
    );

    const onClosureItemClick = useCallback(
        (item: TimelineCalendarItem) => {
            // После перетаскивания серого блока браузер посылает click —
            // не открываем карточку поверх диалога подтверждения переноса.
            if (hasPendingClosureMove) {
                return;
            }

            const closure = displayClosures.find((entry) => entry.id === item.id);
            if (closure) {
                setEditingClosure(closure);
            }
        },
        [displayClosures, hasPendingClosureMove],
    );

    const closureLoading =
        isClosureCreating || isClosureUpdating || isClosureDeleting || isReserveMoveSaving;
    const editingClosureRoomTitle = editingClosure
        ? hotelRooms.find((room) => room.id === editingClosure.room_id)?.title
        : undefined;

    return {
        canvasAction,
        setCanvasAction,
        timelineItems,
        handleItemMove,
        onClosureAdd,
        onClosureItemClick,
        closureMoveDialogProps,
        isRoomClosuresLoading,
        isClosureLoading: closureLoading,
        closureQuickModal: {
            isOpen: !!closureDraft,
            roomTitle: closureDraft?.roomTitle ?? '',
            roomId: closureDraft?.roomId ?? '',
            startUnix: closureDraft?.startUnix,
            endUnix: closureDraft?.endUnix,
            userName,
            isLoading: closureLoading,
            onClose: closeClosureModals,
            onSubmit: createRoomClosure,
        },
        closureEditModal: {
            isOpen: !!editingClosure,
            closure: editingClosure,
            roomTitle: editingClosureRoomTitle,
            rooms: hotelRooms,
            userName,
            isLoading: closureLoading,
            isDeleting: isClosureDeleting,
            onClose: closeClosureModals,
            onSubmit: updateRoomClosure,
            onDelete: deleteRoomClosure,
        },
    };
};
