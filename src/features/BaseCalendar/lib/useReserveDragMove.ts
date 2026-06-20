'use client';

import {
    applyMoveToTimelineItems,
    computeMovedReserveDates,
    formatReservePeriod,
    hasReserveOverlap,
    TimelineReserveItem,
    toReserveUnix,
} from '@/features/BaseCalendar/lib/reserveMove';
import { ReserveDTO } from '@/shared/api/reserve/reserve';
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

export type PendingReserveMove = {
    reserve: TimelineReserveItem;
    newRoomId: string;
    newRoomTitle: string;
    newStartUnix: number;
    newEndUnix: number;
    periodLabel: string;
};

type UseReserveDragMoveParams = {
    hotelRooms: RoomOption[];
    hotelReserves: TimelineReserveItem[];
    updateReserve: (reserve: ReserveDTO) => Promise<unknown>;
    isSaving?: boolean;
};

export const useReserveDragMove = ({
    hotelRooms,
    hotelReserves,
    updateReserve,
    isSaving = false,
}: UseReserveDragMoveParams) => {
    const user = useUnit($user);
    const [pendingMove, setPendingMove] = useState<PendingReserveMove | null>(null);
    const [optimisticReserves, setOptimisticReserves] = useState<TimelineReserveItem[] | null>(
        null,
    );

    useEffect(() => {
        if (!pendingMove) {
            setOptimisticReserves(null);
        }
    }, [hotelReserves, pendingMove]);

    const displayReserves = optimisticReserves ?? hotelReserves;

    const resetPendingMove = useCallback(() => {
        setPendingMove(null);
        setOptimisticReserves(null);
    }, []);

    const handleItemMove = useCallback(
        (itemId: Id, dragTime: number, newGroupOrder: number) => {
            if (pendingMove || isSaving) {
                return;
            }

            const reserve = hotelReserves.find((item) => item.id === itemId);
            const newRoom = hotelRooms[newGroupOrder];

            if (
                !reserve ||
                !newRoom ||
                (reserve as { itemKind?: string }).itemKind === 'closure'
            ) {
                return;
            }

            const { start: newStartUnix, end: newEndUnix } = computeMovedReserveDates(
                reserve,
                dragTime,
            );

            const currentStartUnix = toReserveUnix(reserve.start);
            const currentEndUnix = toReserveUnix(reserve.end);
            const isSamePosition =
                reserve.room_id === newRoom.id &&
                currentStartUnix === newStartUnix &&
                currentEndUnix === newEndUnix;

            if (isSamePosition) {
                return;
            }

            if (
                hasReserveOverlap(
                    hotelReserves,
                    newRoom.id,
                    newStartUnix,
                    newEndUnix,
                    reserve.id,
                )
            ) {
                showToast('В этом номере уже есть бронь на выбранные даты', 'error');
                return;
            }

            const optimisticItems = applyMoveToTimelineItems(
                hotelReserves,
                reserve.id,
                newRoom.id,
                newStartUnix,
                newEndUnix,
            );

            setOptimisticReserves(optimisticItems);
            setPendingMove({
                reserve,
                newRoomId: newRoom.id,
                newRoomTitle: newRoom.title,
                newStartUnix,
                newEndUnix,
                periodLabel: formatReservePeriod(newStartUnix, newEndUnix),
            });
        },
        [hotelReserves, hotelRooms, isSaving, pendingMove],
    );

    const handleConfirmMove = useCallback(async () => {
        if (!pendingMove) {
            return;
        }

        const userName = user ? `${user.name} ${user.surname}`.trim() : undefined;

        try {
            const { start: _start, end: _end, group: _group, ...reserveData } = pendingMove.reserve;

            await updateReserve({
                ...reserveData,
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
    }, [pendingMove, resetPendingMove, updateReserve, user]);

    const dialogProps = useMemo(
        () =>
            pendingMove
                ? {
                      open: true,
                      guestName: pendingMove.reserve.guest,
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
        displayReserves,
        handleItemMove,
        dialogProps,
    };
};
