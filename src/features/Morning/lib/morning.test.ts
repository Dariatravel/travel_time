import { describe, expect, it } from 'vitest';

import {
    buildMorningBoard,
    dayFromIsoDate,
    fillTemplate,
    guestFirstName,
    hasPhone,
    isoDateFromDay,
    moscowDay,
    moscowDayOf,
    touchpointPatch,
    type MorningReserve,
    type TouchpointRow,
} from './morning';

// «Сейчас» — 15.09.2026 10:00 МСК.
const NOW = Date.UTC(2026, 8, 15, 7, 0) / 1000;
const TODAY = moscowDay(NOW);
const DAY = 86400;

/** unix-момент 14:00 МСК для дня со смещением от сегодня. */
const checkIn = (offsetDays: number) => (TODAY + offsetDays) * DAY + 11 * 3600;
/** unix-момент 12:00 МСК. */
const checkOut = (offsetDays: number) => (TODAY + offsetDays) * DAY + 9 * 3600;
const isoDaysAgo = (days: number) => new Date((NOW - days * DAY) * 1000).toISOString();

const reserve = (
    id: string,
    startOffset: number,
    endOffset: number,
    extra: Partial<MorningReserve> = {},
): MorningReserve => ({
    id,
    guest: 'Иванова Анна Петровна',
    phone: '+7 900 000-00-00',
    start: checkIn(startOffset),
    end: checkOut(endOffset),
    price: 4000,
    quantity: 2,
    prepayment: '8000',
    created_at: isoDaysAgo(3),
    external_source: null,
    rooms: { id: 'r', title: 'Стандарт', hotels: { id: 'h', title: 'Мулберри' } },
    booking_cards: { status: 'booked', hotel_notified_at: '2026-09-10T10:00:00Z', manager: null, source: null },
    guest_touchpoints: null,
    ...extra,
});

const touch = (
    kind: TouchpointRow['kind'],
    status: TouchpointRow['status'],
    extra: Partial<TouchpointRow> = {},
): TouchpointRow => ({
    reserve_id: 'x',
    kind,
    status,
    snooze_until: null,
    channel: null,
    done_at: null,
    done_by: null,
    note: null,
    ...extra,
});

const ids = (tasks: { reserve: { id: string } }[]) => tasks.map((t) => t.reserve.id);

describe('московские сутки', () => {
    it('заезд 14:00 и выезд 12:00 МСК попадают в свой день', () => {
        expect(moscowDay(checkIn(0))).toBe(TODAY);
        expect(moscowDay(checkOut(0))).toBe(TODAY);
    });

    it('22:30 UTC — это уже следующий день по Москве', () => {
        expect(moscowDayOf('2026-09-15T22:30:00Z')).toBe(dayFromIsoDate('2026-09-16'));
        expect(moscowDayOf('2026-09-15T20:30:00Z')).toBe(dayFromIsoDate('2026-09-15'));
    });

    it('даты туда и обратно', () => {
        expect(dayFromIsoDate(isoDateFromDay(TODAY))).toBe(TODAY);
        expect(isoDateFromDay(TODAY)).toBe('2026-09-15');
    });
});

describe('заезды и выезды дня', () => {
    it('считает по московским суткам', () => {
        const board = buildMorningBoard([reserve('a', 0, 3), reserve('b', -2, 0), reserve('c', 1, 4)], NOW);
        expect(board.arrivals.map((r) => r.id)).toEqual(['a']);
        expect(board.departures.map((r) => r.id)).toEqual(['b']);
    });

    it('отменённая и перенесённая карточки не попадают никуда', () => {
        const cancelled = reserve('a', 0, 3, {
            booking_cards: { status: 'cancelled', hotel_notified_at: null, manager: null, source: null },
        });
        const transferred = reserve('b', 3, 6, {
            booking_cards: { status: 'transferred', hotel_notified_at: null, manager: null, source: null },
        });
        const board = buildMorningBoard([cancelled, transferred], NOW);
        expect(board.arrivals).toEqual([]);
        expect(board.unconfirmedByHotel).toEqual([]);
        expect(board.reminders).toEqual([]);
    });
});

describe('напоминание о заезде', () => {
    it('появляется ровно за 3 дня, раньше — нет', () => {
        const board = buildMorningBoard([reserve('soon', 3, 6), reserve('later', 4, 7), reserve('far', 20, 25)], NOW);
        expect(ids(board.reminders)).toEqual(['soon']);
        expect(board.reminders[0].overdueDays).toBe(0);
        expect(board.reminders[0].canPostpone).toBe(true);
    });

    it('просрочка в днях; в день заезда ещё показывается; после заезда задним числом — нет', () => {
        const board = buildMorningBoard([reserve('late', 1, 4), reserve('today', 0, 3), reserve('gone', -1, 3)], NOW);
        // Сортировка по сроку: сначала самое просроченное.
        expect(ids(board.reminders)).toEqual(['today', 'late']);
        expect(board.reminders[0].overdueDays).toBe(3);
        expect(board.reminders[1].overdueDays).toBe(2);
        expect(board.overdue).toBe(2);
    });

    it('начатое (перенесённое) напоминание остаётся и после заезда', () => {
        const r = reserve('kept', -1, 3, {
            guest_touchpoints: [touch('reminder', 'postponed', { snooze_until: isoDateFromDay(TODAY - 1) })],
        });
        expect(ids(buildMorningBoard([r], NOW).reminders)).toEqual(['kept']);
    });

    it('закрывается отметкой «сделано»; перенесённое скрыто до срока, потом срок = дата переноса', () => {
        const done = reserve('done', 2, 5, { guest_touchpoints: [touch('reminder', 'done')] });
        const snoozed = reserve('snoozed', 2, 5, {
            guest_touchpoints: [touch('reminder', 'postponed', { snooze_until: isoDateFromDay(TODAY + 1) })],
        });
        const expired = reserve('expired', 2, 5, {
            guest_touchpoints: [touch('reminder', 'postponed', { snooze_until: isoDateFromDay(TODAY) })],
        });
        const board = buildMorningBoard([done, snoozed, expired], NOW);
        expect(ids(board.reminders)).toEqual(['expired']);
        // Перенесли на сегодня — это «сегодня», а не «просрочено».
        expect(board.reminders[0].overdueDays).toBe(0);
    });

    it('при просрочке больше 14 дней перенос недоступен', () => {
        const r = reserve('old', -20, -17, {
            guest_touchpoints: [touch('reminder', 'postponed', { snooze_until: isoDateFromDay(TODAY - 16) })],
        });
        const board = buildMorningBoard([r], NOW);
        expect(board.reminders[0].canPostpone).toBe(false);
    });
});

describe('отзывы', () => {
    it('просьба об отзыве ровно через 7 дней после выезда, раньше — нет', () => {
        const board = buildMorningBoard(
            [reserve('r7', -12, -7), reserve('r6', -11, -6), reserve('r9', -14, -9), reserve('far', -5, 1)],
            NOW,
        );
        expect(ids(board.reviewRequests)).toEqual(['r9', 'r7']);
        expect(board.reviewRequests[0].overdueDays).toBe(2);
        expect(board.reviewRequests[1].overdueDays).toBe(0);
        expect(board.overdue).toBe(1);
    });

    it('«не приехали» по запросу отзыва закрывает и проверку, и напоминание', () => {
        const r = reserve('na', -10, -8, {
            guest_touchpoints: [
                touch('review_request', 'not_arrived'),
            ],
        });
        const board = buildMorningBoard([r], NOW);
        expect(board.reviewRequests).toEqual([]);
        expect(board.reviewChecks).toEqual([]);
    });

    it('проверка отзыва через 2 дня после запроса; «позже» откладывает на 3; найденный закрывает', () => {
        const requested = reserve('chk', -20, -15, {
            guest_touchpoints: [touch('review_request', 'done', { done_at: isoDaysAgo(2) })],
        });
        const early = reserve('early', -20, -15, {
            guest_touchpoints: [touch('review_request', 'done', { done_at: isoDaysAgo(1) })],
        });
        const later = reserve('later', -20, -15, {
            guest_touchpoints: [
                touch('review_request', 'done', { done_at: isoDaysAgo(5) }),
                touch('review_check', 'review_later', { snooze_until: isoDateFromDay(TODAY + 2) }),
            ],
        });
        const found = reserve('found', -20, -15, {
            guest_touchpoints: [
                touch('review_request', 'done', { done_at: isoDaysAgo(5) }),
                touch('review_check', 'review_found'),
            ],
        });
        const postponed = reserve('pp', -20, -15, {
            guest_touchpoints: [
                touch('review_request', 'done', { done_at: isoDaysAgo(5) }),
                touch('review_check', 'postponed', { snooze_until: isoDateFromDay(TODAY) }),
            ],
        });
        const board = buildMorningBoard([requested, early, later, found, postponed], NOW);
        // Оба на сегодня; порядок — как в исходном списке.
        expect(ids(board.reviewChecks)).toEqual(['chk', 'pp']);
        expect(board.reviewRequests).toEqual([]);
    });
});

describe('без подтверждения отеля, думают, без телефона', () => {
    it('бронь без отметки «отельеру» и без предоплаты дольше 15 часов', () => {
        const unconfirmed = reserve('u', 5, 8, { booking_cards: null });
        const thinking = reserve('t', 5, 8, { prepayment: null });
        const arrivingToday = reserve('today', 0, 3, { prepayment: null });
        const fresh = reserve('f', 5, 8, { prepayment: '', created_at: new Date((NOW - 3600) * 1000).toISOString() });
        const external = reserve('e', 5, 8, { prepayment: null, external_source: 'ical', booking_cards: null });
        const board = buildMorningBoard([unconfirmed, thinking, arrivingToday, fresh, external], NOW);
        expect(board.unconfirmedByHotel.map((r) => r.id)).toEqual(['u']);
        expect(board.thinking.map((r) => r.id)).toEqual(['t']);
    });

    it('без телефона — отдельная корзина, задач не создаёт; внешние брони в неё не попадают', () => {
        const board = buildMorningBoard(
            [reserve('np', 2, 5, { phone: '' }), reserve('ext', 2, 5, { phone: '', external_source: 'mirror' })],
            NOW,
        );
        expect(board.noPhone.map((r) => r.id)).toEqual(['np']);
        expect(board.reminders).toEqual([]);
        expect(hasPhone({ phone: '12-34' } as MorningReserve)).toBe(false);
        expect(hasPhone({ phone: '8 (900) 123-45-67' } as MorningReserve)).toBe(true);
    });
});

describe('отметки и шаблоны', () => {
    it('перенос на завтра и «позже» ставят snooze, остальное — done_at', () => {
        expect(touchpointPatch('postponed', TODAY, 'Ира', 'now')).toEqual({
            status: 'postponed',
            snooze_until: isoDateFromDay(TODAY + 1),
        });
        expect(touchpointPatch('review_later', TODAY, 'Ира', 'now').snooze_until).toBe(isoDateFromDay(TODAY + 3));
        expect(touchpointPatch('done', TODAY, 'Ира', 'now')).toEqual({
            status: 'done',
            snooze_until: null,
            done_at: 'now',
            done_by: 'Ира',
        });
    });

    it('обращение — по имени, а не по фамилии', () => {
        expect(guestFirstName('Иванова Анна Петровна')).toBe('Анна');
        expect(guestFirstName('Петров Сергей')).toBe('Сергей');
        expect(guestFirstName('Ольга')).toBe('Ольга');
        expect(guestFirstName('')).toBe('');
    });

    it('подставляет имя, отель и даты; неизвестные поля оставляет', () => {
        const text = fillTemplate('{имя}, заезд {заезд} в {отель}, даты {даты}. {Имя} {name} {неизвестно}', reserve('a', 3, 6));
        expect(text).toBe('Анна, заезд 18.09 в Мулберри, даты 18.09–21.09. Анна Анна {неизвестно}');
    });
});
