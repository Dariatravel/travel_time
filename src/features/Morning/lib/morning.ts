/**
 * «Утро менеджера» — чистые функции: из броней и отметок менеджера собираем
 * список дел на сегодня. Правила взяты из панели напоминаний Иры
 * (reminder-dashboard) один в один:
 *   напоминание о заезде — за 3 дня до заезда;
 *   просьба об отзыве  — через 7 дней после выезда;
 *   проверка отзыва    — через 2 дня после того, как отзыв запрошен;
 *   «перенести на завтра» — +1 день, «обещали позже» — +3 дня;
 *   задача показывается только когда срок наступил, закрывается действием
 *   и больше не показывается; при просрочке больше 14 дней перенос недоступен.
 * Задачи не хранятся — считаются каждый раз; хранится только то, что менеджер
 * отметил (guest_touchpoints).
 *
 * Сознательные отличия от панели Иры (согласовать с Дарьей):
 *   «Не приехали» закрывает все касания по брони, а не только одно;
 *   отменённая или перенесённая карточка брони закрывает все касания.
 */

import { MOSCOW_UTC_OFFSET_HOURS } from '@/shared/lib/moscowTime';
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
    comment?: string | null;
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
    /** Срок с учётом переносов (индекс московских суток). */
    dueDay: number;
    overdueDays: number; // > 0 — просрочено
    /** Перенос недоступен: просрочка больше 14 дней — только закрывающие действия. */
    canPostpone: boolean;
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
/** Как в панели Иры: при просрочке больше стольких дней кнопки «перенести» нет. */
export const MAX_POSTPONE_OVERDUE_DAYS = 14;

const MOSCOW_OFFSET_SECONDS = MOSCOW_UTC_OFFSET_HOURS * 3600;
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

/** Гость не приехал, бронь отменена или перенесена — все касания по брони закрыты. */
export const isReserveClosed = (reserve: MorningReserve): boolean => {
    const cardStatus = cardOf(reserve)?.status;
    if (cardStatus === 'cancelled' || cardStatus === 'transferred') return true;

    return (reserve.guest_touchpoints ?? []).some((t) => CLOSED_FOR_ALL.includes(t.status));
};

const isKindClosed = (t: TouchpointRow | null): boolean => {
    if (!t) return false;

    return ['done', 'not_arrived', 'cancelled', 'review_found', 'checked'].includes(t.status);
};

/** Срок с учётом переноса: пока перенос не истёк — его дата, потом она же как «срок». */
const effectiveDue = (baseDue: number, t: TouchpointRow | null): number => {
    if (!t?.snooze_until) return baseDue;

    return Math.max(baseDue, dayFromIsoDate(t.snooze_until));
};

export const hasPhone = (reserve: MorningReserve): boolean =>
    (reserve.phone ?? '').replace(/\D/g, '').length >= 7;

const makeTask = (
    reserve: MorningReserve,
    kind: TouchpointKind,
    baseDue: number,
    today: number,
): MorningTask | null => {
    const touchpoint = touchpointOf(reserve, kind);
    if (isKindClosed(touchpoint)) return null;
    const dueDay = effectiveDue(baseDue, touchpoint);
    // Срок ещё не наступил — не показываем (как в панели Иры).
    if (dueDay > today) return null;
    const overdueDays = today - dueDay;

    return {
        key: `${reserve.id}:${kind}`,
        kind,
        reserve,
        dueDay,
        overdueDays,
        canPostpone: overdueDays <= MAX_POSTPONE_OVERDUE_DAYS,
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

        // Внешние брони (iCal, зеркала) приходят без телефона и без карточки —
        // напоминать им нельзя, чинить нечего: синхронизация пересоздаёт строки.
        if (reserve.external_source || closed) continue;

        // Без телефона гостю не написать — отдельная корзина, в задачи не попадает.
        if (!hasPhone(reserve)) {
            if (endDay >= today) board.noPhone.push(reserve);
            continue;
        }

        // Напоминание о заезде: за 3 дня; после заезда задним числом не создаём,
        // но уже начатое (перенесённое) — остаётся до закрытия.
        const reminderTouch = touchpointOf(reserve, 'reminder');
        if (startDay >= today || reminderTouch) {
            const task = makeTask(reserve, 'reminder', startDay - REMINDER_DAYS_BEFORE, today);
            if (task && (startDay >= today || task.touchpoint)) board.reminders.push(task);
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
        if (startDay >= today && !card?.hotel_notified_at) {
            board.unconfirmedByHotel.push(reserve);
        }

        // «Думают»: бронь на будущее, предоплаты нет дольше 15 часов.
        if (
            startDay > today &&
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
    reminder: ['done', 'postponed'],
    review_request: ['done', 'postponed', 'not_arrived'],
    review_check: ['review_found', 'review_later', 'checked', 'postponed'],
};

export const DONE_LABELS: Record<TouchpointKind, string> = {
    reminder: 'ОК, напоминание отправлено',
    review_request: 'ОК, отзыв запрошен',
    review_check: 'Отзыв есть',
};

/**
 * Имя гостя для обращения. Бронь хранит «Фамилия Имя Отчество» (как в OKO и
 * в таблице Иры), поэтому берём второе слово; если слово одно — его.
 */
export const guestFirstName = (guest: string): string => {
    const parts = guest.trim().split(/\s+/).filter(Boolean);

    return parts[1] ?? parts[0] ?? '';
};

/** Подстановка {имя} {отель} {даты} {заезд} {выезд} в шаблон сообщения. */
export const fillTemplate = (body: string, reserve: MorningReserve): string => {
    const hotel = reserve.rooms?.hotels?.title ?? '';
    const checkIn = formatDay(moscowDay(reserve.start));
    const checkOut = formatDay(moscowDay(reserve.end));
    const name = guestFirstName(reserve.guest);
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
