import { getDateFromUnix } from '@/shared/lib/date';
import { ReserveDTO } from '@/shared/api/reserve/reserve';
import moment, { Moment } from 'moment';

export type ReserveTime = number | Date | Moment;

export type TimelineReserveItem = Omit<ReserveDTO, 'start' | 'end'> & {
    group: string;
    start: Moment;
    end: Moment;
};

export const toReserveUnix = (value: ReserveTime): number => {
    if (typeof value === 'number') {
        return value;
    }

    if (moment.isMoment(value)) {
        return value.unix();
    }

    return Math.floor(value.getTime() / 1000);
};

export const getReserveDurationDays = (start: ReserveTime, end: ReserveTime): number => {
    const checkInDay = moment.unix(toReserveUnix(start)).startOf('day');
    const checkOutDay = moment.unix(toReserveUnix(end)).startOf('day');

    return checkOutDay.diff(checkInDay, 'days');
};

export const computeMovedReserveDates = (
    reserve: { start: ReserveTime; end: ReserveTime },
    dragTimeMs: number,
): { start: number; end: number } => {
    const durationDays = getReserveDurationDays(reserve.start, reserve.end);
    const start = moment(dragTimeMs).startOf('day').hour(12).unix();
    const end = moment.unix(start).add(durationDays, 'days').hour(11).unix();

    return { start, end };
};

export const hasReserveOverlap = (
    reserves: Array<{ id: string; room_id: string; start: ReserveTime; end: ReserveTime }>,
    roomId: string,
    startUnix: number,
    endUnix: number,
    excludeId?: string,
): boolean => {
    return reserves
        .filter((reserve) => reserve.room_id === roomId && reserve.id !== excludeId)
        .some((reserve) => {
            const reserveStart = toReserveUnix(reserve.start);
            const reserveEnd = toReserveUnix(reserve.end);
            return startUnix < reserveEnd && reserveStart < endUnix;
        });
};

export const buildTimelineReserveItems = (
    rooms: Array<{ id: string; reserves: ReserveDTO[] }>,
): TimelineReserveItem[] => {
    const reserves: TimelineReserveItem[] = [];

    rooms.forEach(({ id: room_id, reserves: roomReserves }) => {
        roomReserves.forEach(({ end, start, ...reserve }) => {
            reserves.push({
                ...reserve,
                id: reserve.id,
                room_id,
                group: room_id,
                end: getDateFromUnix(
                    typeof end === 'number' ? end : Math.floor(end.getTime() / 1000),
                ),
                start: getDateFromUnix(
                    typeof start === 'number' ? start : Math.floor(start.getTime() / 1000),
                ),
            });
        });
    });

    return reserves;
};

export const applyMoveToTimelineItems = (
    items: TimelineReserveItem[],
    reserveId: string,
    newRoomId: string,
    newStartUnix: number,
    newEndUnix: number,
): TimelineReserveItem[] => {
    return items.map((item) => {
        if (item.id !== reserveId) {
            return item;
        }

        return {
            ...item,
            group: newRoomId,
            room_id: newRoomId,
            start: getDateFromUnix(newStartUnix),
            end: getDateFromUnix(newEndUnix),
        };
    });
};

export const formatReservePeriod = (startUnix: number, endUnix: number): string => {
    const start = moment.unix(startUnix);
    const end = moment.unix(endUnix);

    if (start.isSame(end, 'day')) {
        return start.format('D MMM YYYY');
    }

    if (start.isSame(end, 'year')) {
        return `${start.format('D MMM')} – ${end.format('D MMM YYYY')}`;
    }

    return `${start.format('D MMM YYYY')} – ${end.format('D MMM YYYY')}`;
};
