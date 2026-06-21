'use client';

import {
    formatClosurePeriod,
    hasTimelineBlockOverlap,
    type TimelineBlockEntry,
} from '@/features/BaseCalendar/lib/timelineBlocks';
import {
    computeMovedReserveDates,
} from '@/features/BaseCalendar/lib/reserveMove';
import { type RoomClosureDTO } from '@/shared/api/closure/roomClosure';
import { getDate } from '@/shared/lib/getDate';
import { $user } from '@/shared/models/auth';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useUnit } from 'effector-react/compat';
import { Id } from 'my-react-calendar-timeline';
import { useCallback, useEffect, useMemo, useState } from 'react';

type RoomOption = {
    id: string;
    title: string;
};

export type PendingClosureMove = {
    closure: RoomClosureDTO;
    newRoomId: string;
    newRoomTitle: string;
    newStartUnix: number;
    newEndUnix: number;
    periodLabel: string;
};

type UseClosureDragMoveParams = {
    hotelRooms: RoomOption[];
    roomClosures: RoomClosureDTO[];
    getBlockedEntries: () => TimelineBlockEntry[];
    updateRoomClosure: (closure: RoomClosureDTO) => Promise<unknown>;
    isSaving?: boolean;
};

const applyMoveToRoomClosures = (
    closures: RoomClosureDTO[],
    closureId: string,
    newRoomId: string,
    newStartUnix: number,
    newEndUnix: number,
): RoomClosureDTO[] =>
    closures.map((closure) =>
        closure.id !== closureId
            ? closure
            : {
                  ...closure,
                  room_id: newRoomId,
                  start: newStartUnix,
                  end: newEndUnix,
              },
    );

export const useClosureDragMove = ({
    hotelRooms,
    roomClosures,
    getBlockedEntries,
    updateRoomClosure,
    isSaving = false,
}: UseClosureDragMoveParams) => {
    const user = useUnit($user);
    const [pendingMove, setPendingMove] = useState<PendingClosureMove | null>(null);
    const [optimisticClosures, setOptimisticClosures] = useState<RoomClosureDTO[] | null>(null);

    useEffect(() => {
        if (!pendingMove) {
            setOptimisticClosures(null);
        }
    }, [roomClosures, pendingMove]);

    const displayClosures = optimisticClosures ?? roomClosures;

    const resetPendingMove = useCallback(() => {
        setPendingMove(null);
        setOptimisticClosures(null);
    }, []);

    const handleClosureItemMove = useCallback(
        (itemId: Id, dragTime: number, newGroupOrder: number) => {
            if (pendingMove || isSaving) {
                return;
            }

            const closure = roomClosures.find((item) => item.id === itemId);
            const newRoom = hotelRooms[newGroupOrder];

            if (!closure || !newRoom) {
                return;
            }

            const { start: newStartUnix, end: newEndUnix } = computeMovedReserveDates(
                { start: closure.start, end: closure.end },
                dragTime,
            );

            const isSamePosition =
                closure.room_id === newRoom.id &&
                closure.start === newStartUnix &&
                closure.end === newEndUnix;

            if (isSamePosition) {
                return;
            }

            if (
                hasTimelineBlockOverlap(
                    getBlockedEntries(),
                    newRoom.id,
                    newStartUnix,
                    newEndUnix,
                    closure.id,
                )
            ) {
                showToast('На выбранные даты уже есть бронь или закрытие', 'error');
                return;
            }

            setOptimisticClosures(
                applyMoveToRoomClosures(
                    roomClosures,
                    closure.id,
                    newRoom.id,
                    newStartUnix,
                    newEndUnix,
                ),
            );
            setPendingMove({
                closure,
                newRoomId: newRoom.id,
                newRoomTitle: newRoom.title,
                newStartUnix,
                newEndUnix,
                periodLabel: formatClosurePeriod(newStartUnix, newEndUnix),
            });
        },
        [getBlockedEntries, hotelRooms, isSaving, pendingMove, roomClosures],
    );

    const handleConfirmMove = useCallback(async () => {
        if (!pendingMove) {
            return;
        }

        const userName = user ? `${user.name} ${user.surname}`.trim() : undefined;

        try {
            await updateRoomClosure({
                ...pendingMove.closure,
                room_id: pendingMove.newRoomId,
                start: pendingMove.newStartUnix,
                end: pendingMove.newEndUnix,
                edited_by: userName,
                edited_at: getDate(),
            });
            resetPendingMove();
        } catch {
            resetPendingMove();
        }
    }, [pendingMove, resetPendingMove, updateRoomClosure, user]);

    const dialogProps = useMemo(
        () =>
            pendingMove
                ? {
                      open: true,
                      title: 'Переместить закрытие?',
                      guestName: pendingMove.closure.reason?.trim() || 'Закрыто',
                      roomTitle: pendingMove.newRoomTitle,
                      periodLabel: pendingMove.periodLabel,
                      isLoading: isSaving,
                      onConfirm: handleConfirmMove,
                      onCancel: resetPendingMove,
                  }
                : null,
        [handleConfirmMove, isSaving, pendingMove, resetPendingMove],
    );

    return {
        displayClosures,
        handleClosureItemMove,
        dialogProps,
        hasPendingMove: !!pendingMove,
    };
};
