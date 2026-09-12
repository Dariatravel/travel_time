import { describe, expect, it } from 'vitest';

import {
    buildStatement,
    calcBooking,
    dayFromIsoDate,
    formatDay,
    isCountable,
    isoDateFromDay,
    moscowDay,
    ourFeeFor,
    parseMoney,
    periodFor,
    totals,
    validateTerms,
    type FinanceReserve,
    type HotelTermsRow,
} from './finance';

const DAY = 86400;
const D = dayFromIsoDate('2026-09-14'); // понедельник
const START = D - 7; // начало учёта — неделей раньше
const checkIn = (day: number) => day * DAY + 11 * 3600; // 14:00 МСК
const checkOut = (day: number) => day * DAY + 9 * 3600; // 12:00 МСК

const reserve = (id: string, hotel: string, startDay: number, endDay: number, extra: Partial<FinanceReserve> = {}): FinanceReserve => ({
    id,
    guest: 'Гость',
    start: checkIn(startDay),
    end: checkOut(endDay),
    price: 4000,
    prepayment: '8000',
    external_source: null,
    rooms: { id: 'r', title: 'Стандарт', hotels: { id: hotel, title: `Отель ${hotel}` } },
    booking_cards: { status: 'booked' },
    ...extra,
});

const terms = (hotel_id: string, extra: Partial<HotelTermsRow> = {}): HotelTermsRow => ({
    hotel_id,
    model: 'prepay_is_fee',
    hotel_share_pct: null,
    fixed_amount: null,
    prepay_direct_to_hotel: false,
    payout_period: 'week',
    min_nights: null,
    deposit_note: null,
    note: null,
    ...extra,
});

const HOTELS = [
    { id: 'h1', title: 'Отель h1' },
    { id: 'h2', title: 'Отель h2' },
    { id: 'h3', title: 'Мулберри' },
];

describe('предоплата из текстового поля', () => {
    it('читает «5 000», «5000 ₽», «5000 руб», запятую; мусор — NaN; пусто — 0', () => {
        expect(parseMoney('5 000')).toBe(5000);
        expect(parseMoney('5000 ₽')).toBe(5000);
        expect(parseMoney('5000 руб.')).toBe(5000);
        expect(parseMoney('4500,50')).toBe(4500.5);
        expect(parseMoney(3000)).toBe(3000);
        expect(parseMoney('')).toBe(0);
        expect(parseMoney(null)).toBe(0);
        expect(Number.isNaN(parseMoney('20%'))).toBe(true);
        expect(Number.isNaN(parseMoney('5тр'))).toBe(true);
    });
});

describe('доля по условиям отеля', () => {
    it('без условий — null, «предоплата — наша услуга» — вся предоплата', () => {
        expect(ourFeeFor(null, 8000, 5)).toBeNull();
        expect(ourFeeFor(terms('h'), 8000, 5)).toBe(8000);
    });

    it('процент отелю, границы 0–100', () => {
        expect(ourFeeFor(terms('h', { model: 'share_pct', hotel_share_pct: 30 }), 8000, 5)).toBe(5600);
        expect(ourFeeFor(terms('h', { model: 'share_pct', hotel_share_pct: 150 }), 8000, 5)).toBe(0);
        expect(ourFeeFor(terms('h', { model: 'share_pct', hotel_share_pct: null }), 8000, 5)).toBe(8000);
    });

    it('фикс за бронь и за ночь, не больше предоплаты, отрицательный фикс = 0', () => {
        expect(ourFeeFor(terms('h', { model: 'fixed_per_booking', fixed_amount: 1500 }), 8000, 5)).toBe(1500);
        expect(ourFeeFor(terms('h', { model: 'fixed_per_night', fixed_amount: 500 }), 8000, 5)).toBe(2500);
        expect(ourFeeFor(terms('h', { model: 'fixed_per_night', fixed_amount: 5000 }), 8000, 5)).toBe(8000);
        expect(ourFeeFor(terms('h', { model: 'fixed_per_booking', fixed_amount: -500 }), 8000, 5)).toBe(0);
    });
});

describe('расчёт брони', () => {
    it('тариф × ночи, предоплата, доплата на месте, кто кому должен', () => {
        const calc = calcBooking(reserve('a', 'h', D, D + 5), terms('h', { model: 'share_pct', hotel_share_pct: 25 }));
        expect(calc).toMatchObject({
            nights: 5,
            gross: 20000,
            prepaid: 8000,
            toPayOnSite: 12000,
            ourFee: 6000,
            hotelShare: 2000,
            weOweHotel: 2000,
            hotelOwesUs: 0,
            termsKnown: true,
            prepaidUnknown: false,
            statusUnknown: false,
        });
    });

    it('доверенный отель: предоплата ушла отелю — отель должен нам нашу долю', () => {
        const calc = calcBooking(reserve('a', 'h', D, D + 5), terms('h', { model: 'fixed_per_booking', fixed_amount: 1500, prepay_direct_to_hotel: true }));
        expect(calc?.weOweHotel).toBe(0);
        expect(calc?.hotelOwesUs).toBe(1500);
    });

    it('без условий долг не считается; нечитаемая предоплата помечается', () => {
        const calc = calcBooking(reserve('a', 'h', D, D + 5, { prepayment: '20%', booking_cards: null }), null);
        expect(calc?.ourFee).toBeNull();
        expect(calc?.weOweHotel).toBe(0);
        expect(calc?.prepaidUnknown).toBe(true);
        expect(calc?.prepaid).toBe(0);
        expect(calc?.statusUnknown).toBe(true);
    });

    it('предоплата больше оборота и ноль ночей не ломают расчёт', () => {
        const calc = calcBooking(reserve('a', 'h', D, D, { prepayment: '9000' }), terms('h'));
        expect(calc?.nights).toBe(0);
        expect(calc?.gross).toBe(0);
        expect(calc?.toPayOnSite).toBe(0);
        expect(calc?.ourFee).toBe(9000);
    });

    it('бронь без отеля не считается', () => {
        expect(calcBooking(reserve('a', 'h', D, D + 1, { rooms: null }), null)).toBeNull();
    });
});

describe('какие брони считаются', () => {
    it('внешние, отменённые/перенесённые карточки и сделки в отказе/возврате — нет', () => {
        expect(isCountable(reserve('a', 'h', D, D + 1))).toBe(true);
        expect(isCountable(reserve('a', 'h', D, D + 1, { external_source: 'ical' }))).toBe(false);
        expect(isCountable(reserve('a', 'h', D, D + 1, { booking_cards: { status: 'cancelled' } }))).toBe(false);
        expect(isCountable(reserve('a', 'h', D, D + 1, { booking_cards: { status: 'transferred' } }))).toBe(false);
        expect(isCountable(reserve('a', 'h', D, D + 1, { booking_cards: null, deals: { stage: 'otkaz', pipeline: 'sales' } }))).toBe(false);
        expect(isCountable(reserve('a', 'h', D, D + 1, { booking_cards: null, deals: [{ stage: 'vozvrat', pipeline: 'refund' }] }))).toBe(false);
        expect(isCountable(reserve('a', 'h', D, D + 1, { booking_cards: null, deals: { stage: 'bron', pipeline: 'sales' } }))).toBe(true);
    });
});

describe('ведомость за период', () => {
    const h1terms = terms('h1', { model: 'share_pct', hotel_share_pct: 50 });

    it('строки периода — по выезду; остаток — накопленный с начала учёта', () => {
        const rows = buildStatement({
            reserves: [
                reserve('in', 'h1', D - 3, D + 1), // выезд во вторник — в периоде: отелю 4000
                reserve('prev', 'h1', START, START + 2), // прошлая неделя: отелю 4000 — только в накопленном
                reserve('before-start', 'h1', START - 10, START - 1), // до начала учёта — не считается
                reserve('cancelled', 'h1', D, D + 2, { booking_cards: { status: 'cancelled' } }),
                reserve('ext', 'h1', D, D + 2, { external_source: 'ical' }),
                reserve('h2', 'h2', D + 1, D + 4, { prepayment: '3000' }), // без условий
            ],
            hotels: HOTELS,
            terms: [h1terms],
            payouts: [
                { id: 'p1', hotel_id: 'h1', paid_at: isoDateFromDay(D), amount: 4000, method: null, comment: 'за прошлую неделю', created_by: null },
                { id: 'p-deleted', hotel_id: 'h1', paid_at: isoDateFromDay(D), amount: 999, method: null, comment: null, created_by: null, deleted_at: '2026-09-15T00:00:00Z' },
            ],
            adjustments: [
                { id: 'a', hotel_id: 'h1', reserve_id: null, date: isoDateFromDay(D + 3), direction: 'we_owe_hotel', amount: 500, comment: null, created_by: null },
                { id: 'b', hotel_id: 'h1', reserve_id: null, date: isoDateFromDay(D + 20), direction: 'we_owe_hotel', amount: 999, comment: null, created_by: null },
            ],
            startDay: START,
            fromDay: D,
            toDay: D + 6,
        });
        const h1 = rows.find((r) => r.hotelId === 'h1');
        expect(h1?.bookingsCount).toBe(1);
        expect(h1?.nights).toBe(4);
        expect(h1?.gross).toBe(16000);
        expect(h1?.ourFee).toBe(4000);
        expect(h1?.weOweHotel).toBe(4000);
        expect(h1?.adjustmentsWeOwe).toBe(500);
        expect(h1?.paid).toBe(4000);
        expect(h1?.periodDue).toBe(4500);
        // накопленно: 4000 (prev) + 4000 (in) + 500 − 4000 (выплата) = 4500
        expect(h1?.balance).toBe(4500);

        const h2 = rows.find((r) => r.hotelId === 'h2');
        expect(h2?.terms).toBeNull();
        expect(h2?.ourFee).toBe(0);
        expect(h2?.weOweHotel).toBe(0);
        expect(h2?.prepaid).toBe(3000);

        const sum = totals(rows);
        expect(sum).toMatchObject({ bookingsCount: 2, gross: 28000, balanceWeOwe: 4500, balanceOwedToUs: 0, hotelsWithoutTerms: 1 });
        expect(rows[0].hotelId).toBe('h1');
    });

    it('отель без движений в периоде, но с остатком, показывается с названием', () => {
        const rows = buildStatement({
            reserves: [reserve('prev', 'h3', START, START + 2)],
            hotels: HOTELS,
            terms: [terms('h3', { model: 'fixed_per_booking', fixed_amount: 1000 })],
            payouts: [],
            adjustments: [],
            startDay: START,
            fromDay: D,
            toDay: D + 6,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].hotelTitle).toBe('Мулберри');
        expect(rows[0].bookingsCount).toBe(0);
        expect(rows[0].balance).toBe(7000);
    });

    it('доверенный отель даёт отрицательный остаток — отель должен нам', () => {
        const rows = buildStatement({
            reserves: [reserve('a', 'h1', D, D + 2)],
            hotels: HOTELS,
            terms: [terms('h1', { model: 'fixed_per_night', fixed_amount: 500, prepay_direct_to_hotel: true })],
            payouts: [],
            adjustments: [],
            startDay: START,
            fromDay: D,
            toDay: D + 6,
        });
        expect(rows[0].hotelOwesUs).toBe(1000);
        expect(rows[0].balance).toBe(-1000);
        expect(totals(rows).balanceOwedToUs).toBe(1000);
    });

    it('выезд ровно в 12:00 последнего дня периода и 00:30 МСК следующего', () => {
        const last = reserve('last', 'h1', D + 4, D + 6);
        const next = reserve('next', 'h1', D + 4, D + 7, { end: (D + 7) * DAY - 3 * 3600 + 30 * 60 }); // 00:30 МСК дня D+7
        const rows = buildStatement({
            reserves: [last, next],
            hotels: HOTELS,
            terms: [h1terms],
            payouts: [],
            adjustments: [],
            startDay: START,
            fromDay: D,
            toDay: D + 6,
        });
        expect(rows[0].bookings.map((b) => b.reserve.id)).toEqual(['last']);
    });
});

describe('периоды, проверки, форматы', () => {
    it('неделя пн–вс и месяц, в том числе через границу года', () => {
        expect(periodFor(D + 3, 'week')).toEqual({ fromDay: D, toDay: D + 6 });
        expect(periodFor(D, 'week', -1)).toEqual({ fromDay: D - 7, toDay: D - 1 });
        const month = periodFor(D, 'month');
        expect(isoDateFromDay(month.fromDay)).toBe('2026-09-01');
        expect(isoDateFromDay(month.toDay)).toBe('2026-09-30');
        const dec = dayFromIsoDate('2026-12-20');
        expect(isoDateFromDay(periodFor(dec, 'month', 1).fromDay)).toBe('2027-01-01');
        expect(isoDateFromDay(periodFor(dec, 'month', 1).toDay)).toBe('2027-01-31');
    });

    it('проверка условий перед сохранением', () => {
        expect(validateTerms({ model: 'share_pct', hotel_share_pct: null, fixed_amount: null, min_nights: null })).toBe('Укажите процент отелю');
        expect(validateTerms({ model: 'share_pct', hotel_share_pct: 120, fixed_amount: null, min_nights: null })).toBe('Процент должен быть от 0 до 100');
        expect(validateTerms({ model: 'fixed_per_night', hotel_share_pct: null, fixed_amount: -1, min_nights: null })).toBe('Фикс не может быть отрицательным');
        expect(validateTerms({ model: 'prepay_is_fee', hotel_share_pct: null, fixed_amount: null, min_nights: 0 })).toBe('Минимум ночей должен быть больше нуля');
        expect(validateTerms({ model: 'prepay_is_fee', hotel_share_pct: null, fixed_amount: null, min_nights: null })).toBeNull();
    });

    it('московские сутки и формат', () => {
        expect(moscowDay(checkOut(D))).toBe(D);
        expect(formatDay(D)).toBe('14.09.2026');
    });
});
