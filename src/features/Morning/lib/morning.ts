/**
 * «Утро менеджера» — чистые функции: из броней и отметок менеджера собираем
 * список дел на сегодня. Правила взяты из панели напоминаний Иры
 * (reminder-dashboard) один в один:
 *   напоминание о заезде — за 3 дня до заезда;
 *   просьба об отзыве  — через 7 дней после выезда;
 *   проверка отзыва    — через 2 дня после того, как отзыв запрошен;
 *   «перенести на завтра» — +1 день, «обещали позже» — +3 дня;
 *   задача закрывается действием и больше не показывается.
 * Задачи не хранятся — считаются каждый раз; хранится только то, что менеджер
 * отметил (guest_touchpoints).
 */

import { parsePrepayment } from '@/shared/lib/parsePrepayment';

export type TouchpointKind = 'reminder' | 'review_request' | 'review_check';
export type TouchpointStatus =
    | 'pending'
    | 'done'
    | 'postponed'
    | 'not_arrived'
    | 'cancelled'
    | 'review_found'
    | 'review_later'
    | 'checked';

export type TouchpointRow = {
    reserve_id: string;
    kind: TouchpointKind;
    status: TouchpointStatus;
    snooze_until: string | null; // YYYY-MM-DD
    channel: string | null;
    done_at: string | null;
    done_by: string | null;
    note: string | null;
    updated_at?: string;
};

export type MorningReserve = {
    id: string;
    guest: string;
    phone: string;
    start: number;
    end: number;
    price: number;
    quantity: number;
    prepayment: string | number | null;
    created_at: string | null;
    external_source: string | null;
    rooms: {
        id: string;
        title: string;
        hotels: { id: string; title: string; address?: string | null; phone?: string | null } | null;
    } | null;
    booking_cards:
        | { status: string; hotel_notified_at: string | null; manager: string | null; source: string | null }
        | { status: string; hotel_notified_at: string | null; manager: string | null; source: string | null }[]
        | null;
    guest_touchpoints: TouchpointRow[] | null;
};

export type MorningTask = {
    key: string;
    kind: TouchpointKind;
    reserve: MorningReserve;
    dueDay: number; // индекс московских суток
    overdueDays: number; // > 0 — просрочено
    touchpoint: TouchpointRow | null;
};

export type MorningBoard = {
    today: number;
    arrivals: MorningReserve[];
    departures: MorningReserve[];
    reminders: MorningTask[];
    reviewRequests: MorningTask[];
    reviewChecks: MorningTask[];
    unconfirmedByHotel: MorningReserve[];
    thinking: MorningReserve[];
    noPhone: MorningReserve[];
    overdue: number;
};

export const REMINDER_DAYS_BEFORE = 3;
export const REVIEW_REQUEST_DAYS_AFTER = 7;
export const REVIEW_CHECK_DAYS_AFTER = 2;
export const POSTPONE_DAYS = 1;
export const REVIEW_LATER_DAYS = 3;
export const THINKING_HOURS = 15;
/** Горизонт: задачи «на потом» показываем не дальше, чем за столько дней. */
export const LOOKAHEAD_DAYS = 7;

const MOSCOW_OFFSET_SECONDS = 3 * 3600;
const DAY = 86400;

/** Индекс московских суток для unix-секунд. */
export const moscowDay = (unix: number): number => Math.floor((unix + MOSCOW_OFFSET_SECONDS) / DAY);

/** Индекс московских суток для ISO-строки/даты. */
export const moscowDayOf = (value: string | Date): number =>
    moscowDay(Math.floor(new Date(value).getTime() / 1000));

/** YYYY-MM-DD → индекс суток (дата уже «московская»). */
export const dayFromIsoDate = (iso: string): number => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);

    return Math.floor(Date.UTC(y, m - 1, d) / 1000 / DAY);
};

/** Индекс суток → YYYY-MM-DD. */
export const isoDateFromDay = (day: number): string =>
    new Date(day * DAY * 1000).toISOString().slice(0, 10);

/** ДД.ММ для строки задачи. */
export const formatDay = (day: number): string => {
    const date = new Date(day * DAY * 1000);

    return `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const cardOf = (reserve: MorningReserve) => {
    const value = reserve.booking_cards;
    if (!value) return null;

    return Array.isArray(value) ? (value[0] ?? null) : value;
};

const touchpointOf = (reserve: MorningReserve, kind: TouchpointKind): TouchpointRow | null =>
    (reserve.guest_touchpoints ?? []).find((t) => t.kind === kind) ?? null;

const CLOSED_FOR_ALL: TouchpointStatus[] = ['not_arrived', 'cancelled'];

/** Гость не приехал или бронь отменена — все касания по брони закрыты. */
const isReserveClosed = (reserve: MorningReserve): boolean => {
    if (cardOf(reserve)?.status === 'cancelled') return true;

    return (reserve.guest_touchpoints ?? []).some((t) => CLOSED_FOR_ALL.includes(t.status));
};

const isKindClosed = (t: TouchpointRow | null): boolean => {
    if (!t) return false;

    return ['done', 'not_arrived', 'cancelled', 'review_found', 'checked'].includes(t.status);
};

const isSnoozed = (t: TouchpointRow | null, today: number): boolean =>
    !!t?.snooze_until && dayFromIsoDate(t.snooze_until) > today;

export const hasPhone = (reserve: MorningReserve): boolean =>
    (reserve.phone ?? '').replace(/\D/g, '').length >= 7;

const makeTask = (
    reserve: MorningReserve,
    kind: TouchpointKind,
    dueDay: number,
    today: number,
): MorningTask | null => {
    if (dueDay > today + LOOKAHEAD_DAYS) return null;
    const touchpoint = touchpointOf(reserve, kind);
    if (isKindClosed(touchpoint) || isSnoozed(touchpoint, today)) return null;

    return {
        key: `${reserve.id}:${kind}`,
        kind,
        reserve,
        dueDay,
        overdueDays: Math.max(0, today - dueDay),
        touchpoint,
    };
};

const byDue = (a: MorningTask, b: MorningTask) => a.dueDay - b.dueDay;

/**
 * Собирает доску дня. `nowUnix` — текущий момент (unix-секунды), чтобы
 * функция была чистой и проверяемой.
 */
export const buildMorningBoard = (reserves: MorningReserve[], nowUnix: number): MorningBoard => {
    const today = moscowDay(nowUnix);
    const board: MorningBoard = {
        today,
        arrivals: [],
        departures: [],
        reminders: [],
        reviewRequests: [],
        reviewChecks: [],
        unconfirmedByHotel: [],
        thinking: [],
        noPhone: [],
        overdue: 0,
    };

    for (const reserve of reserves) {
        const startDay = moscowDay(reserve.start);
        const endDay = moscowDay(reserve.end);
        const card = cardOf(reserve);
        const closed = isReserveClosed(reserve);

        if (startDay === today && !closed) board.arrivals.push(reserve);
        if (endDay === today && !closed) board.departures.push(reserve);

        // Без телефона гостю не написать — отдельная корзина, в задачи не попадает.
        if (!hasPhone(reserve)) {
            if (!closed && endDay >= today) board.noPhone.push(reserve);
            continue;
        }
        if (closed) continue;

        // Напоминание о заезде: за 3 дня; задним числом (гость уже заехал) не создаём.
        if (startDay > today) {
            const task = makeTask(reserve, 'reminder', startDay - REMINDER_DAYS_BEFORE, today);
            if (task) board.reminders.push(task);
        }

        // Просьба об отзыве: через 7 дней после выезда.
        if (endDay <= today) {
            const task = makeTask(reserve, 'review_request', endDay + REVIEW_REQUEST_DAYS_AFTER, today);
            if (task) board.reviewRequests.push(task);
        }

        // Проверка отзыва: через 2 дня после того, как отзыв запрошен.
        const request = touchpointOf(reserve, 'review_request');
        if (request?.status === 'done' && request.done_at) {
            const task = makeTask(
                reserve,
                'review_check',
                moscowDayOf(request.done_at) + REVIEW_CHECK_DAYS_AFTER,
                today,
            );
            if (task) board.reviewChecks.push(task);
        }

        // Бронь без подтверждения отеля — будущий заезд, отельеру не отправлено.
        if (startDay >= today && !card?.hotel_notified_at && !reserve.external_source) {
            board.unconfirmedByHotel.push(reserve);
        }

        // «Думают»: бронь есть, предоплаты нет дольше 15 часов, заезд впереди.
        if (
            startDay >= today &&
            !reserve.external_source &&
            parsePrepayment(reserve.prepayment) === 0 &&
            reserve.created_at &&
            nowUnix - Math.floor(new Date(reserve.created_at).getTime() / 1000) > THINKING_HOURS * 3600
        ) {
            board.thinking.push(reserve);
        }
    }

    board.reminders.sort(byDue);
    board.reviewRequests.sort(byDue);
    board.reviewChecks.sort(byDue);
    board.overdue = [...board.reminders, ...board.reviewRequests, ...board.reviewChecks].filter(
        (t) => t.overdueDays > 0,
    ).length;

    return board;
};

/** Что записать в guest_touchpoints по нажатию кнопки. */
export const touchpointPatch = (
    action: TouchpointStatus,
    today: number,
    actor: string,
    nowIso: string,
): Partial<TouchpointRow> & { status: TouchpointStatus } => {
    switch (action) {
        case 'postponed':
            return { status: 'postponed', snooze_until: isoDateFromDay(today + POSTPONE_DAYS) };
        case 'review_later':
            return { status: 'review_later', snooze_until: isoDateFromDay(today + REVIEW_LATER_DAYS) };
        default:
            return { status: action, snooze_until: null, done_at: nowIso, done_by: actor };
    }
};

export const TASK_LABELS: Record<TouchpointKind, string> = {
    reminder: 'Напомнить о заезде',
    review_request: 'Запросить отзыв',
    review_check: 'Проверить отзыв',
};

export const ACTION_LABELS: Record<TouchpointStatus, string> = {
    pending: 'Ждёт',
    done: 'Сделано',
    postponed: 'Перенести на завтра',
    not_arrived: 'Не приехали',
    cancelled: 'Отмена',
    review_found: 'Отзыв есть',
    review_later: 'Обещали позже',
    checked: 'Проверено, отзыва нет',
};

/** Какие кнопки у задачи каждого вида — как в панели Иры. */
export const TASK_ACTIONS: Record<TouchpointKind, TouchpointStatus[]> = {
    reminder: ['done', 'postponed', 'not_arrived'],
    review_request: ['done', 'postponed', 'not_arrived'],
    review_check: ['review_found', 'review_later', 'checked', 'postponed'],
};

export const DONE_LABELS: Record<TouchpointKind, string> = {
    reminder: 'ОК, напоминание отправлено',
    review_request: 'ОК, отзыв запрошен',
    review_check: 'Отзыв есть',
};

/** Подстановка {имя} {отель} {даты} {заезд} {выезд} в шаблон сообщения. */
export const fillTemplate = (body: string, reserve: MorningReserve): string => {
    const hotel = reserve.rooms?.hotels?.title ?? '';
    const checkIn = formatDay(moscowDay(reserve.start));
    const checkOut = formatDay(moscowDay(reserve.end));
    const name = reserve.guest.trim().split(/\s+/)[0] ?? '';
    const values: Record<string, string> = {
        имя: name,
        Имя: name,
        name: name,
        отель: hotel,
        отеле: hotel,
        hotel: hotel,
        даты: `${checkIn}–${checkOut}`,
        заезд: checkIn,
        выезд: checkOut,
    };

    return body.replace(/\{([^}]+)\}/g, (match, key: string) => values[key.trim()] ?? match);
};
