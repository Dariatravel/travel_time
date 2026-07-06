'use client';

import {
    applyMoveToTimelineItems,
    computeMovedReserveDates,
    formatReservePeriod,
    TimelineReserveItem,
    toReserveUnix,
} from '@/features/BaseCalendar/lib/reserveMove';
import {
    isTrialHotelTitle,
    isTrialReserveFixed,
} from '@/features/BaseCalendar/lib/trialBookingLayout';
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
    conflictLabels: string[];
};

type UseReserveDragMoveParams = {
    hotelRooms: RoomOption[];
    hotelReserves: TimelineReserveItem[];
    updateReserve: (reserve: ReserveDTO) => Promise<unknown>;
    isSaving?: boolean;
    hotelTitle?: string | null;
};

export const useReserveDragMove = ({
    hotelRooms,
    hotelReserves,
    updateReserve,
    isSaving = false,
    hotelTitle,
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
            const currentRoom = reserve
                ? hotelRooms.find((room) => room.id === reserve.room_id)
                : undefined;

            if (
                !reserve ||
                !newRoom ||
                (reserve as { itemKind?: string }).itemKind === 'closure'
            ) {
                return;
            }

            if (isTrialHotelTitle(hotelTitle)) {
                if (isTrialReserveFixed(reserve, currentRoom)) {
                    showToast('Эта бронь закреплена и не перемещается', 'error');
                    return;
                }
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

            const overlappingReserves = hotelReserves.filter((item) => {
                if (item.room_id !== newRoom.id || item.id === reserve.id) {
                    return false;
                }

                const itemStartUnix = toReserveUnix(item.start);
                const itemEndUnix = toReserveUnix(item.end);

                return newStartUnix < itemEndUnix && itemStartUnix < newEndUnix;
            });
            const conflictLabels = overlappingReserves.map((item) => {
                const guestLabel = item.guest?.trim() || 'Без имени';
                return `${guestLabel}: ${formatReservePeriod(toReserveUnix(item.start), toReserveUnix(item.end))}`;
            });

            if (conflictLabels.length > 0) {
                showToast(
                    `Нельзя переместить бронь: в номере ${newRoom.title} уже есть бронь на эти даты`,
                    'error',
                );
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
                conflictLabels,
            });

        },
        [hotelReserves, hotelRooms, hotelTitle, isSaving, pendingMove],
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
                      title:
                          pendingMove.conflictLabels.length > 0
                              ? 'Переместить с пересечением?'
                              : undefined,
                      guestName: pendingMove.reserve.guest,
                      roomTitle: pendingMove.newRoomTitle,
                      periodLabel: pendingMove.periodLabel,
                      conflictLabels: pendingMove.conflictLabels,
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
        hasPendingMove: !!pendingMove,
    };
};
