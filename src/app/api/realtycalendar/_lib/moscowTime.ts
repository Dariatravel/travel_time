/**
 * Расчёт unix-времени заезда (14:00) и выезда (12:00) в московской таймзоне.
 *
 * Раньше даты строились через new Date(year, month, day) + setHours — это
 * таймзона контейнера (в проде UTC), из-за чего брони из RealtyCalendar
 * сдвигались на 3 часа относительно созданных вручную (менеджеры работают
 * по Москве) и могли давать ложные конфликты на стыковых днях.
 *
 * Москва — UTC+3 без перехода на летнее время (с 2014 года), поэтому
 * смещение можно применять константой без библиотек таймзон.
 */
const MOSCOW_UTC_OFFSET_HOURS = 3;

export const CHECK_IN_HOUR_MSK = 14;
export const CHECK_OUT_HOUR_MSK = 12;

export const toMoscowStayUnix = (
    year: number,
    month: number,
    day: number,
    endOfStay: boolean,
): number => {
    const hourMsk = endOfStay ? CHECK_OUT_HOUR_MSK : CHECK_IN_HOUR_MSK;

    return Math.floor(
        Date.UTC(year, month - 1, day, hourMsk - MOSCOW_UTC_OFFSET_HOURS, 0, 0, 0) / 1000,
    );
};
