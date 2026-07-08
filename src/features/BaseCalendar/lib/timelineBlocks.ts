import { getDateFromUnix } from '@/shared/lib/date';
import { ReserveDTO } from '@/shared/api/reserve/reserve';
import { RoomClosureDTO } from '@/shared/api/closure/roomClosure';
import {
    TimelineReserveItem,
    toReserveUnix,
    type ReserveTime,
} from '@/features/BaseCalendar/lib/reserveMove';
import moment, { Moment } from 'moment';

export type TimelineBlockKind = 'reserve' | 'closure';

export type TimelineCalendarItem = TimelineReserveItem & {
    itemKind: TimelineBlockKind;
    reason?: string | null;
};

export type TimelineBlockEntry = {
    id: string;
    room_id: string;
    start: ReserveTime;
    end: ReserveTime;
    itemKind: TimelineBlockKind;
};

export const isTimelineClosureItem = (
    item: Pick<TimelineCalendarItem, 'itemKind'>,
): item is TimelineCalendarItem & { itemKind: 'closure' } => item.itemKind === 'closure';

export const buildTimelineClosureItems = (
    closures: RoomClosureDTO[],
): TimelineCalendarItem[] =>
    closures.map((closure) => ({
        id: closure.id,
        room_id: closure.room_id,
        group: closure.room_id,
        start: getDateFromUnix(closure.start),
        end: getDateFromUnix(closure.end),
        itemKind: 'closure' as const,
        reason: closure.reason,
        guest: closure.reason?.trim() || 'Закрыто',
        phone: '',
        price: 0,
        quantity: 0,
    }));

export const buildTimelineCalendarItems = (
    rooms: Array<{ id: string; reserves: ReserveDTO[] }>,
    closures: RoomClosureDTO[] = [],
): TimelineCalendarItem[] => {
    const reserveItems: TimelineCalendarItem[] = [];

    rooms.forEach(({ id: room_id, reserves }) => {
        reserves.forEach(({ end, start, ...reserve }) => {
            reserveItems.push({
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
                itemKind: 'reserve',
            });
        });
    });

    return [...reserveItems, ...buildTimelineClosureItems(closures)];
};

export const toTimelineBlockEntries = (
    items: Array<
        Pick<TimelineCalendarItem, 'id' | 'room_id' | 'start' | 'end' | 'itemKind'>
    >,
): TimelineBlockEntry[] =>
    items.map(({ id, room_id, start, end, itemKind }) => ({
        id,
        room_id,
        start,
        end,
        itemKind,
    }));

const toTimelineDayIndex = (value: ReserveTime) => Math.floor(toReserveUnix(value) / 86_400);

export const hasTimelineBlockOverlap = (
    entries: TimelineBlockEntry[],
    roomId: string,
    startUnix: number,
    endUnix: number,
    excludeId?: string,
): boolean =>
    entries
        .filter((entry) => entry.room_id === roomId && entry.id !== excludeId)
        .some((entry) => {
            return (
                toTimelineDayIndex(entry.start) < Math.floor(endUnix / 86_400) &&
                toTimelineDayIndex(entry.end) > Math.floor(startUnix / 86_400)
            );
        });

export const formatClosurePeriod = (startUnix: number, endUnix: number): string => {
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

export const getTimelineItemLabel = (item: Pick<TimelineCalendarItem, 'itemKind' | 'guest' | 'phone' | 'reason'>) => {
    if (isTimelineClosureItem(item)) {
        return item.reason?.trim() || 'Закрыто';
    }

    return `${item.guest ?? ''} ${item.phone ?? ''}`.trim();
};

export const normalizeTimelineVisualItem = (item: { start: Moment | number | Date; end: Moment | number | Date }) => ({
    ...item,
    start: moment.isMoment(item.start)
        ? item.start.clone().hour(14).minute(0).second(0).millisecond(0)
        : getDateFromUnix(toReserveUnix(item.start)).hour(14).minute(0).second(0).millisecond(0),
    end: moment.isMoment(item.end)
        ? item.end.clone().hour(12).minute(0).second(0).millisecond(0)
        : getDateFromUnix(toReserveUnix(item.end)).hour(12).minute(0).second(0).millisecond(0),
});
