import { parseReserveTime } from '@/shared/lib/date';
import { localDateToMoscowStayUnix } from '@/shared/lib/moscowTime';
import moment from 'moment';
import type { DateRange } from 'react-day-picker';

export const toReserveFormDay = (value: Date | number | string) =>
    parseReserveTime(value).startOf('day').toDate();

export const getReserveFormNightCount = (start: Date, end: Date) =>
    moment(end).startOf('day').diff(moment(start).startOf('day'), 'days');

export const isValidReserveFormPeriod = (start?: Date, end?: Date) => {
    if (!start || !end) {
        return false;
    }

    return getReserveFormNightCount(start, end) >= 1;
};

/**
 * При редактировании диапазона react-day-picker сбрасывает выбор с первого клика.
 * Если новая дата не раньше текущего заезда — считаем, что меняют дату выезда.
 */
export const resolveReserveDateRangeSelection = (
    range: DateRange | undefined,
    currentRange?: [Date, Date],
): [Date, Date] | undefined => {
    if (!range?.from) {
        return undefined;
    }

    const nextFrom = toReserveFormDay(range.from);

    if (range.to) {
        return [nextFrom, toReserveFormDay(range.to)];
    }

    const [currentStart] = currentRange ?? [];
    if (currentStart && moment(nextFrom).isSameOrAfter(moment(currentStart).startOf('day'))) {
        return [toReserveFormDay(currentStart), nextFrom];
    }

    return [nextFrom, nextFrom];
};

export const serializeReserveFormDates = (date: [Date, Date]) => {
    const start = localDateToMoscowStayUnix(date[0], false);
    const end = localDateToMoscowStayUnix(date[1], true);

    return { start, end };
};

/** Timeline canvas click: ms since epoch; API reserves use unix seconds. */
export const parseTimelineCanvasTime = (time: number) =>
    time > 1e12 ? moment(time) : moment.unix(time);

export const getReserveDraftFromTimelineClick = (time: number) => {
    const checkInDay = parseTimelineCanvasTime(time).startOf('day');

    return serializeReserveFormDates([
        checkInDay.toDate(),
        checkInDay.clone().add(1, 'day').toDate(),
    ]);
};

export const getReserveFormDefaultDates = (
    reserve?: { start?: number | Date; end?: number | Date },
    fallbackStart?: Date,
    fallbackEnd?: Date,
): [Date, Date] => {
    const today = moment().startOf('day').toDate();
    const tomorrow = moment().add(1, 'day').startOf('day').toDate();

    const startDate = reserve?.start
        ? toReserveFormDay(reserve.start)
        : (fallbackStart ?? today);
    const endDate = reserve?.end ? toReserveFormDay(reserve.end) : (fallbackEnd ?? tomorrow);

    return [startDate, endDate];
};
