import { describe, expect, it } from 'vitest';

import {
    buildMorningBoard,
    dayFromIsoDate,
    fillTemplate,
    isoDateFromDay,
    moscowDay,
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

const reserve = (
    id: string,
    startOffset: number,
    endOffset: number,
    extra: Partial<MorningReserve> = {},
): MorningReserve => ({
    id,
    guest: 'Иванова Анна',
    phone: '+7 900 000-00-00',
    start: checkIn(startOffset),
    end: checkOut(endOffset),
    price: 4000,
    quantity: 2,
    prepayment: '8000',
    created_at: new Date((NOW - 3 * DAY) * 1000).toISOString(),
    external_source: null,
    rooms: { id: 'r', title: 'Стандарт', hotels: { id: 'h', title: 'Мулберри' } },
    booking_cards: { status: 'booked', hotel_notified_at: '2026-09-10T10:00:00Z', manager: null, source: null },
    guest_touchpoints: null,
    ...extra,
});

const touch = (kind: TouchpointRow['kind'], status: TouchpointRow['status'], extra: Partial<TouchpointRow> = {}): TouchpointRow => ({
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

describe('заезды и выезды дня', () => {
    it('считает по московским суткам', () => {
        const board = buildMorningBoard([reserve('a', 0, 3), reserve('b', -2, 0), reserve('c', 1, 4)], NOW);
        expect(board.arrivals.map((r) => r.id)).toEqual(['a']);
        expect(board.departures.map((r) => r.id)).toEqual(['b']);
    });

    it('отменённая карточка не попадает никуда', () => {
        const board = buildMorningBoard(
            [reserve('a', 0, 3, { booking_cards: { status: 'cancelled', hotel_notified_at: null, manager: null, source: null } })],
            NOW,
        );
        expect(board.arrivals).toEqual([]);
        expect(board.unconfirmedByHotel).toEqual([]);
        expect(board.reminders).toEqual([]);
    });
});

describe('напоминание о заезде', () => {
    it('появляется за 3 дня и раньше — нет', () => {
        const board = buildMorningBoard([reserve('soon', 3, 6), reserve('later', 4, 7), reserve('far', 20, 25)], NOW);
        expect(board.reminders.map((t) => t.reserve.id)).toEqual(['soon', 'later']);
        expect(board.reminders[0].overdueDays).toBe(0);
        expect(board.reminders[1].dueDay).toBe(TODAY + 1);
    });

    it('просрочка считается в днях, задним числом после заезда не создаётся', () => {
        const board = buildMorningBoard([reserve('late', 1, 4), reserve('arrived', -1, 3)], NOW);
        expect(board.reminders.map((t) => t.reserve.id)).toEqual(['late']);
        expect(board.reminders[0].overdueDays).toBe(2);
        expect(board.overdue).toBe(1);
    });

    it('закрывается отметкой «сделано» и не показывается, пока перенесена', () => {
        const done = reserve('done', 2, 5, { guest_touchpoints: [touch('reminder', 'done')] });
        const snoozed = reserve('snoozed', 2, 5, {
            guest_touchpoints: [touch('reminder', 'postponed', { snooze_until: isoDateFromDay(TODAY + 1) })],
        });
        const expired = reserve('expired', 2, 5, {
            guest_touchpoints: [touch('reminder', 'postponed', { snooze_until: isoDateFromDay(TODAY) })],
        });
        const board = buildMorningBoard([done, snoozed, expired], NOW);
        expect(board.reminders.map((t) => t.reserve.id)).toEqual(['expired']);
    });

    it('«не приехали» закрывает все касания по брони', () => {
        const r = reserve('na', -10, -8, { guest_touchpoints: [touch('reminder', 'not_arrived')] });
        const board = buildMorningBoard([r], NOW);
        expect(board.reviewRequests).toEqual([]);
    });
});

describe('отзывы', () => {
    it('просьба об отзыве через 7 дней после выезда', () => {
        const board = buildMorningBoard(
            [reserve('r7', -12, -7), reserve('r6', -11, -6), reserve('far', -5, 1)],
            NOW,
        );
        // r7 — срок сегодня; r6 — завтра (в горизонте 7 дней); far ещё не выехал.
        expect(board.reviewRequests.map((t) => t.reserve.id)).toEqual(['r7', 'r6']);
        expect(board.reviewRequests[0].overdueDays).toBe(0);
        expect(board.reviewRequests[1].dueDay).toBe(TODAY + 1);
    });

    it('проверка отзыва через 2 дня после запроса; «обещали позже» откладывает на 3', () => {
        const requested = reserve('chk', -20, -15, {
            guest_touchpoints: [
                touch('review_request', 'done', { done_at: new Date((NOW - 2 * DAY) * 1000).toISOString() }),
            ],
        });
        const later = reserve('later', -20, -15, {
            guest_touchpoints: [
                touch('review_request', 'done', { done_at: new Date((NOW - 5 * DAY) * 1000).toISOString() }),
                touch('review_check', 'review_later', { snooze_until: isoDateFromDay(TODAY + 2) }),
            ],
        });
        const found = reserve('found', -20, -15, {
            guest_touchpoints: [
                touch('review_request', 'done', { done_at: new Date((NOW - 5 * DAY) * 1000).toISOString() }),
                touch('review_check', 'review_found'),
            ],
        });
        const board = buildMorningBoard([requested, later, found], NOW);
        expect(board.reviewChecks.map((t) => t.reserve.id)).toEqual(['chk']);
        expect(board.reviewRequests).toEqual([]);
    });
});

describe('без подтверждения отеля, думают, без телефона', () => {
    it('бронь без отметки «отельеру» и без предоплаты дольше 15 часов', () => {
        const unconfirmed = reserve('u', 5, 8, { booking_cards: null });
        const thinking = reserve('t', 5, 8, { prepayment: null });
        const fresh = reserve('f', 5, 8, { prepayment: '', created_at: new Date((NOW - 3600) * 1000).toISOString() });
        const external = reserve('e', 5, 8, { prepayment: null, external_source: 'ical', booking_cards: null });
        const board = buildMorningBoard([unconfirmed, thinking, fresh, external], NOW);
        expect(board.unconfirmedByHotel.map((r) => r.id)).toEqual(['u']);
        expect(board.thinking.map((r) => r.id)).toEqual(['t']);
    });

    it('без телефона — отдельная корзина, задач не создаёт', () => {
        const board = buildMorningBoard([reserve('np', 2, 5, { phone: '' })], NOW);
        expect(board.noPhone.map((r) => r.id)).toEqual(['np']);
        expect(board.reminders).toEqual([]);
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

    it('даты туда и обратно', () => {
        expect(dayFromIsoDate(isoDateFromDay(TODAY))).toBe(TODAY);
        expect(isoDateFromDay(TODAY)).toBe('2026-09-15');
    });

    it('подставляет имя, отель и даты', () => {
        const text = fillTemplate('{имя}, заезд {заезд} в {отель}, даты {даты}. {неизвестно}', reserve('a', 3, 6));
        expect(text).toBe('Иванова, заезд 18.09 в Мулберри, даты 18.09–21.09. {неизвестно}');
    });
});
