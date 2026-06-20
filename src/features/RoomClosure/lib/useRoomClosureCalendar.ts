'use client';

import { TimelineReserveItem } from '@/features/BaseCalendar/lib/reserveMove';
import {
    buildTimelineClosureItems,
    toTimelineBlockEntries,
    type TimelineCalendarItem,
} from '@/features/BaseCalendar/lib/timelineBlocks';
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
};

export const useRoomClosureCalendar = ({
    hotelId,
    hotelRooms,
    hotelReserves,
    displayReserves,
}: UseRoomClosureCalendarParams) => {
    const user = useUnit($user);
    const userName = user ? `${user.name} ${user.surname}`.trim() : undefined;
    const { data: roomClosures = [] } = useRoomClosuresByHotel(hotelId);

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

    const timelineItems = useMemo((): TimelineCalendarItem[] => {
        const reserveItems = displayReserves.map((item) => ({
            ...item,
            itemKind: 'reserve' as const,
        }));

        return [...reserveItems, ...buildTimelineClosureItems(roomClosures)];
    }, [displayReserves, roomClosures]);

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
            const closure = roomClosures.find((entry) => entry.id === item.id);
            if (closure) {
                setEditingClosure(closure);
            }
        },
        [roomClosures],
    );

    const closureLoading = isClosureCreating || isClosureUpdating;
    const editingClosureRoomTitle = editingClosure
        ? hotelRooms.find((room) => room.id === editingClosure.room_id)?.title
        : undefined;

    return {
        canvasAction,
        setCanvasAction,
        timelineItems,
        onClosureAdd,
        onClosureItemClick,
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
            userName,
            isLoading: closureLoading,
            isDeleting: isClosureDeleting,
            onClose: closeClosureModals,
            onSubmit: updateRoomClosure,
            onDelete: deleteRoomClosure,
        },
    };
};
