import { describe, expect, it } from 'vitest';

import {
    buildStatement,
    calcBooking,
    dayFromIsoDate,
    formatDay,
    isoDateFromDay,
    moscowDay,
    ourFeeFor,
    periodFor,
    totals,
    type FinanceReserve,
    type HotelTermsRow,
} from './finance';

const DAY = 86400;
const D = dayFromIsoDate('2026-09-14'); // понедельник
const checkIn = (day: number) => day * DAY + 11 * 3600; // 14:00 МСК
const checkOut = (day: number) => day * DAY + 9 * 3600; // 12:00 МСК

const reserve = (id: string, hotel: string, startDay: number, endDay: number, extra: Partial<FinanceReserve> = {}): FinanceReserve => ({
    id,
    guest: 'Гость',
    start: checkIn(startDay),
    end: checkOut(endDay),
    price: 4000,
    quantity: 2,
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

describe('доля по условиям отеля', () => {
    it('без условий и при «предоплата — наша услуга» вся предоплата наша', () => {
        expect(ourFeeFor(null, 8000, 5)).toBe(8000);
        expect(ourFeeFor(terms('h'), 8000, 5)).toBe(8000);
    });

    it('процент отелю', () => {
        expect(ourFeeFor(terms('h', { model: 'share_pct', hotel_share_pct: 30 }), 8000, 5)).toBe(5600);
        expect(ourFeeFor(terms('h', { model: 'share_pct', hotel_share_pct: 150 }), 8000, 5)).toBe(0);
    });

    it('фикс за бронь и за ночь, не больше предоплаты', () => {
        expect(ourFeeFor(terms('h', { model: 'fixed_per_booking', fixed_amount: 1500 }), 8000, 5)).toBe(1500);
        expect(ourFeeFor(terms('h', { model: 'fixed_per_night', fixed_amount: 500 }), 8000, 5)).toBe(2500);
        expect(ourFeeFor(terms('h', { model: 'fixed_per_night', fixed_amount: 5000 }), 8000, 5)).toBe(8000);
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
        });
    });

    it('доверенный отель: предоплата ушла отелю — отель должен нам нашу долю', () => {
        const calc = calcBooking(
            reserve('a', 'h', D, D + 5),
            terms('h', { model: 'fixed_per_booking', fixed_amount: 1500, prepay_direct_to_hotel: true }),
        );
        expect(calc?.weOweHotel).toBe(0);
        expect(calc?.hotelOwesUs).toBe(1500);
    });

    it('бронь без отеля не считается', () => {
        expect(calcBooking(reserve('a', 'h', D, D + 1, { rooms: null }), null)).toBeNull();
    });
});

describe('ведомость за период', () => {
    it('считает по выезду, пропускает отменённые и внешние, учитывает выплаты и корректировки', () => {
        const rows = buildStatement({
            reserves: [
                reserve('in', 'h1', D - 3, D + 1), // выезд во вторник — в периоде
                reserve('early', 'h1', D - 10, D - 1), // выезд до периода
                reserve('cancelled', 'h1', D, D + 2, { booking_cards: { status: 'cancelled' } }),
                reserve('ext', 'h1', D, D + 2, { external_source: 'ical' }),
                reserve('h2', 'h2', D + 1, D + 4, { prepayment: '3000' }),
            ],
            terms: [terms('h1', { model: 'share_pct', hotel_share_pct: 50 })],
            payouts: [{ id: 'p', hotel_id: 'h1', paid_at: isoDateFromDay(D + 2), amount: 1000, method: null, comment: null, created_by: null }],
            adjustments: [
                { id: 'a', hotel_id: 'h1', reserve_id: null, date: isoDateFromDay(D + 3), direction: 'we_owe_hotel', amount: 500, comment: null, created_by: null },
                { id: 'b', hotel_id: 'h1', reserve_id: null, date: isoDateFromDay(D + 20), direction: 'we_owe_hotel', amount: 999, comment: null, created_by: null },
            ],
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
        expect(h1?.paid).toBe(1000);
        expect(h1?.balance).toBe(3500);

        const h2 = rows.find((r) => r.hotelId === 'h2');
        expect(h2?.terms).toBeNull();
        expect(h2?.ourFee).toBe(3000);
        expect(h2?.weOweHotel).toBe(0);

        expect(totals(rows)).toMatchObject({ bookingsCount: 2, gross: 28000, balance: 3500 });
        // Сортировка: сначала больший долг
        expect(rows[0].hotelId).toBe('h1');
    });
});

describe('периоды и даты', () => {
    it('неделя пн–вс и месяц', () => {
        expect(periodFor(D + 3, 'week')).toEqual({ fromDay: D, toDay: D + 6 });
        expect(periodFor(D, 'week', -1)).toEqual({ fromDay: D - 7, toDay: D - 1 });
        const month = periodFor(D, 'month');
        expect(isoDateFromDay(month.fromDay)).toBe('2026-09-01');
        expect(isoDateFromDay(month.toDay)).toBe('2026-09-30');
        expect(isoDateFromDay(periodFor(D, 'month', 1).fromDay)).toBe('2026-10-01');
    });

    it('московские сутки и формат', () => {
        expect(moscowDay(checkOut(D))).toBe(D);
        expect(formatDay(D)).toBe('14.09.2026');
    });
});
