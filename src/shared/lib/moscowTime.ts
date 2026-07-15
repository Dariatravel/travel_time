/**
 * Единая точка расчёта времени заезда (14:00) и выезда (12:00) по Москве.
 *
 * Менеджеры работают по московскому времени, вебхук RealtyCalendar и
 * iCal-синхронизация уже пишут брони в московской зоне. Клиент обязан
 * считать границы так же: расчёт через таймзону браузера давал менеджеру
 * из другого часового пояса другие unix-границы поиска и броней, чем у
 * остальных, — с ложными «занято»/«свободно» на стыковых днях.
 *
 * Москва — UTC+3 без перехода на летнее время (с 2014 года), поэтому
 * смещение применяется константой без библиотек таймзон.
 */
export const MOSCOW_UTC_OFFSET_HOURS = 3;

export const CHECK_IN_HOUR_MSK = 14;
export const CHECK_OUT_HOUR_MSK = 12;

export const toMoscowStayUnix = (
    year: number,
    month: number, // 1–12, как в датах «2026-07-13»
    day: number,
    endOfStay: boolean,
): number => {
    const hourMsk = endOfStay ? CHECK_OUT_HOUR_MSK : CHECK_IN_HOUR_MSK;

    return Math.floor(
        Date.UTC(year, month - 1, day, hourMsk - MOSCOW_UTC_OFFSET_HOURS, 0, 0, 0) / 1000,
    );
};

/**
 * Unix-время заезда/выезда для календарной даты, которую пользователь выбрал
 * в браузере: берутся локальные год/месяц/день Date, час — московский.
 */
export const localDateToMoscowStayUnix = (date: Date, endOfStay: boolean): number =>
    toMoscowStayUnix(date.getFullYear(), date.getMonth() + 1, date.getDate(), endOfStay);
