/**
 * Пересечение броней/периодов «по ночам».
 *
 * Занятость считается по индексам суток floor(unix / 86400), поэтому выезд
 * 12:00 и заезд 14:00 в один и тот же день НЕ конфликтуют — это ключевое
 * правило календаря (та же семантика в триггере запрета двойных броней
 * booking_night_range и в проверках прокси-роутов). Раньше эта логика
 * дублировалась в нескольких файлах; теперь общий источник — здесь.
 */
export type ReserveUnixOrDate = number | Date;

export const toReserveUnix = (value: ReserveUnixOrDate): number =>
    typeof value === 'number' ? value : Math.floor(value.getTime() / 1000);

export const toReserveDayIndex = (value: ReserveUnixOrDate): number =>
    Math.floor(toReserveUnix(value) / 86_400);

export const hasReserveNightOverlap = (
    reserve: { start: ReserveUnixOrDate; end: ReserveUnixOrDate },
    period: { start: ReserveUnixOrDate; end: ReserveUnixOrDate },
): boolean =>
    toReserveDayIndex(reserve.start) < toReserveDayIndex(period.end) &&
    toReserveDayIndex(reserve.end) > toReserveDayIndex(period.start);
