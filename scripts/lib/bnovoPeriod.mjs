// Период занятости, который переносим из Bnovo в нашу шахматку.
//
// Заезд считаем на 14:00 по Москве, выезд на 12:00 — как в самой программе.
// Прошедшую часть брони не переносим: шахматка ведёт будущее, а не архив,
// поэтому начало подтягиваем к сегодняшнему дню.
//
// Здесь и жила поломка. Проверку «конец раньше начала» делали по исходному
// заезду, а в базу писали подтянутое начало. У гостя, который заехал раньше и
// выезжает СЕГОДНЯ, выходило начало сегодня в 14:00 и конец сегодня в 12:00 —
// конец раньше начала. База такую запись справедливо не принимает, и весь
// перенос падал целиком. А выезжающие сегодня есть почти каждый день, поэтому
// крон падал каждый час.
//
// Теперь сравниваем по тому же значению, которое пойдёт в базу.

const MOSCOW_UTC_OFFSET_HOURS = 3;
const CHECK_IN_HOUR_MSK = 14;
const CHECK_OUT_HOUR_MSK = 12;

export const dateToUnix = (isoDate, hourMsk) => {
    const [year, month, day] = isoDate.split('-').map(Number);

    return Math.floor(Date.UTC(year, month - 1, day, hourMsk - MOSCOW_UTC_OFFSET_HOURS) / 1000);
};

/**
 * Возвращает период для записи в шахматку либо null, если переносить нечего:
 * бронь прошла целиком или от неё не осталось ни одной будущей ночи.
 *
 * @param {string} fromDate дата заезда, ГГГГ-ММ-ДД
 * @param {string} toDate   дата выезда, ГГГГ-ММ-ДД
 * @param {number} todayUnix полночь сегодняшнего дня по UTC, в секундах
 */
export const planBookingPeriod = (fromDate, toDate, todayUnix) => {
    const start = dateToUnix(fromDate, CHECK_IN_HOUR_MSK);
    const end = dateToUnix(toDate, CHECK_OUT_HOUR_MSK);

    const today = new Date(todayUnix * 1000).toISOString().slice(0, 10);
    const clampedStart = Math.max(start, dateToUnix(today, CHECK_IN_HOUR_MSK));

    // Сравниваем именно с подтянутым началом — тем самым, что уйдёт в базу.
    // Это же условие отсекает и полностью прошедшие брони.
    if (end <= clampedStart) return null;

    return { start: clampedStart, end };
};
