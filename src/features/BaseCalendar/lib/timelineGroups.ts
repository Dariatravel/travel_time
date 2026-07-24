import { RoomReserves } from '@/shared/api/room/room';

/**
 * Строка шахматки (group для Timeline): все поля номера, кроме списка броней,
 * плюс флаг «в буфере есть бронь».
 */
export type TimelineGroup = Omit<RoomReserves, 'reserves'> & { hasBufferBooking: boolean };

/**
 * Готовит строки-номера для шахматки:
 *  - служебная строка «Буфер для переноса» (is_service) всегда идёт последней,
 *    независимо от order;
 *  - для буфера с хотя бы одной бронью выставляется hasBufferBooking, чтобы
 *    показать индикатор и не потерять транзитную бронь.
 * Общий код для каталога (Calendar) и одиночной шахматки (HotelCalendar).
 */
export const buildTimelineGroups = (rooms: RoomReserves[] = []): TimelineGroup[] => {
    const groups = rooms.map(({ reserves, ...room }) => ({
        ...room,
        title: `${room.title}`,
        hasBufferBooking: Boolean(room.is_service) && (reserves?.length ?? 0) > 0,
    }));

    return [...groups].sort(
        (left, right) => Number(Boolean(left.is_service)) - Number(Boolean(right.is_service)),
    );
};
