/**
 * Финансы с отелями — чистые функции. Ничего не хранится: расчёт по броням
 * делается из reserves + booking_cards + условий отеля (hotel_terms) каждый
 * раз, поэтому правка брони сразу меняет ведомость.
 *
 * Как сейчас устроено у Дарьи: предоплату почти всегда принимает она, отелю
 * переводит его долю по договорённости (у всех отелей — разные). Модели:
 *   prepay_is_fee      — вся предоплата = наша услуга бронирования, отелю ничего;
 *   share_pct          — отелю уходит hotel_share_pct % предоплаты;
 *   fixed_per_booking  — мы оставляем фикс за бронь, остальное отелю;
 *   fixed_per_night    — мы оставляем фикс за ночь, остальное отелю.
 * Доверенные отели (prepay_direct_to_hotel): клиент платит сразу отелю,
 * тогда уже отель должен нам нашу долю.
 * Долг возникает по выезду гостя (отменённые брони в ведомость не попадают).
 */

import { parsePrepayment } from '@/shared/lib/parsePrepayment';

export type TermsModel = 'prepay_is_fee' | 'share_pct' | 'fixed_per_booking' | 'fixed_per_night';

export const TERMS_MODEL_LABELS: Record<TermsModel, string> = {
    prepay_is_fee: 'Предоплата — наша услуга, отелю от нас ничего',
    share_pct: 'Отелю — процент от предоплаты',
    fixed_per_booking: 'Мы оставляем фикс за бронь, остальное отелю',
    fixed_per_night: 'Мы оставляем фикс за ночь, остальное отелю',
};

export type HotelTermsRow = {
    hotel_id: string;
    model: TermsModel;
    hotel_share_pct: number | null;
    fixed_amount: number | null;
    prepay_direct_to_hotel: boolean;
    payout_period: 'week' | 'month';
    min_nights: number | null;
    deposit_note: string | null;
    note: string | null;
    updated_at?: string;
    updated_by?: string | null;
};

export type PayoutRow = {
    id: string;
    hotel_id: string;
    paid_at: string; // YYYY-MM-DD
    amount: number;
    method: string | null;
    comment: string | null;
    created_by: string | null;
    created_at?: string;
};

export type AdjustmentRow = {
    id: string;
    hotel_id: string;
    reserve_id: string | null;
    date: string;
    direction: 'we_owe_hotel' | 'hotel_owes_us';
    amount: number;
    comment: string | null;
    created_by: string | null;
    created_at?: string;
};

export type FinanceReserve = {
    id: string;
    guest: string;
    start: number;
    end: number;
    price: number;
    quantity: number;
    prepayment: string | number | null;
    external_source: string | null;
    rooms: { id: string; title: string; hotels: { id: string; title: string } | null } | null;
    booking_cards: { status: string } | { status: string }[] | null;
};

export type BookingCalc = {
    reserve: FinanceReserve;
    hotelId: string;
    hotelTitle: string;
    nights: number;
    gross: number; // тариф × ночи
    prepaid: number; // предоплата (услуга бронирования)
    toPayOnSite: number; // доплата на месте — отелю напрямую
    ourFee: number; // наша доля из предоплаты
    hotelShare: number; // доля отеля из предоплаты
    weOweHotel: number; // мы должны отелю (предоплата у нас)
    hotelOwesUs: number; // отель должен нам (предоплата ушла отелю напрямую)
    termsKnown: boolean;
};

export type HotelSummary = {
    hotelId: string;
    hotelTitle: string;
    terms: HotelTermsRow | null;
    bookings: BookingCalc[];
    bookingsCount: number;
    nights: number;
    gross: number;
    prepaid: number;
    ourFee: number;
    weOweHotel: number;
    hotelOwesUs: number;
    adjustmentsWeOwe: number;
    adjustmentsHotelOwes: number;
    paid: number;
    /** + мы должны отелю, − отель должен нам. */
    balance: number;
};

const MOSCOW_OFFSET_SECONDS = 3 * 3600;
const DAY = 86400;

export const moscowDay = (unix: number): number => Math.floor((unix + MOSCOW_OFFSET_SECONDS) / DAY);
export const dayFromIsoDate = (iso: string): number => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);

    return Math.floor(Date.UTC(y, m - 1, d) / 1000 / DAY);
};
export const isoDateFromDay = (day: number): string => new Date(day * DAY * 1000).toISOString().slice(0, 10);

const round2 = (value: number) => Math.round(value * 100) / 100;

const cardStatus = (reserve: FinanceReserve): string | null => {
    const value = reserve.booking_cards;
    if (!value) return null;

    return Array.isArray(value) ? (value[0]?.status ?? null) : value.status;
};

/** Наша доля из предоплаты по условиям отеля. Без условий — как prepay_is_fee. */
export const ourFeeFor = (terms: HotelTermsRow | null, prepaid: number, nights: number): number => {
    if (!terms) return prepaid;
    switch (terms.model) {
        case 'share_pct':
            return round2(prepaid * (1 - Math.min(100, Math.max(0, Number(terms.hotel_share_pct ?? 0))) / 100));
        case 'fixed_per_booking':
            return round2(Math.min(prepaid, Number(terms.fixed_amount ?? 0)));
        case 'fixed_per_night':
            return round2(Math.min(prepaid, Number(terms.fixed_amount ?? 0) * nights));
        default:
            return prepaid;
    }
};

export const calcBooking = (reserve: FinanceReserve, terms: HotelTermsRow | null): BookingCalc | null => {
    const hotel = reserve.rooms?.hotels;
    if (!hotel) return null;
    const nights = Math.max(0, moscowDay(reserve.end) - moscowDay(reserve.start));
    const gross = round2(Number(reserve.price ?? 0) * nights);
    const prepaid = round2(parsePrepayment(reserve.prepayment));
    const ourFee = ourFeeFor(terms, prepaid, nights);
    const hotelShare = round2(Math.max(0, prepaid - ourFee));
    const direct = !!terms?.prepay_direct_to_hotel;

    return {
        reserve,
        hotelId: hotel.id,
        hotelTitle: hotel.title,
        nights,
        gross,
        prepaid,
        toPayOnSite: round2(Math.max(0, gross - prepaid)),
        ourFee,
        hotelShare,
        weOweHotel: direct ? 0 : hotelShare,
        hotelOwesUs: direct ? ourFee : 0,
        termsKnown: !!terms,
    };
};

/** Бронь входит в период, если выезд попал в [from, to] по московским суткам. */
export const isInPeriod = (reserve: FinanceReserve, fromDay: number, toDay: number): boolean => {
    const endDay = moscowDay(reserve.end);

    return endDay >= fromDay && endDay <= toDay;
};

const isCountable = (reserve: FinanceReserve): boolean => {
    if (reserve.external_source) return false; // зеркала и iCal — не наши брони
    const status = cardStatus(reserve);

    return status !== 'cancelled' && status !== 'transferred';
};

export type FinanceInput = {
    reserves: FinanceReserve[];
    terms: HotelTermsRow[];
    payouts: PayoutRow[];
    adjustments: AdjustmentRow[];
    fromDay: number;
    toDay: number;
};

/** Ведомость по отелям за период: брони по выезду, выплаты и корректировки по дате. */
export const buildStatement = (input: FinanceInput): HotelSummary[] => {
    const termsByHotel = new Map(input.terms.map((t) => [t.hotel_id, t]));
    const byHotel = new Map<string, HotelSummary>();
    const ensure = (hotelId: string, hotelTitle: string): HotelSummary => {
        let row = byHotel.get(hotelId);
        if (!row) {
            row = {
                hotelId,
                hotelTitle,
                terms: termsByHotel.get(hotelId) ?? null,
                bookings: [],
                bookingsCount: 0,
                nights: 0,
                gross: 0,
                prepaid: 0,
                ourFee: 0,
                weOweHotel: 0,
                hotelOwesUs: 0,
                adjustmentsWeOwe: 0,
                adjustmentsHotelOwes: 0,
                paid: 0,
                balance: 0,
            };
            byHotel.set(hotelId, row);
        }

        return row;
    };

    for (const reserve of input.reserves) {
        if (!isCountable(reserve) || !isInPeriod(reserve, input.fromDay, input.toDay)) continue;
        const calc = calcBooking(reserve, termsByHotel.get(reserve.rooms?.hotels?.id ?? '') ?? null);
        if (!calc) continue;
        const row = ensure(calc.hotelId, calc.hotelTitle);
        row.bookings.push(calc);
        row.bookingsCount += 1;
        row.nights += calc.nights;
        row.gross = round2(row.gross + calc.gross);
        row.prepaid = round2(row.prepaid + calc.prepaid);
        row.ourFee = round2(row.ourFee + calc.ourFee);
        row.weOweHotel = round2(row.weOweHotel + calc.weOweHotel);
        row.hotelOwesUs = round2(row.hotelOwesUs + calc.hotelOwesUs);
    }

    const inRange = (iso: string) => {
        const day = dayFromIsoDate(iso);

        return day >= input.fromDay && day <= input.toDay;
    };
    const titleOf = (hotelId: string) =>
        byHotel.get(hotelId)?.hotelTitle ?? input.reserves.find((r) => r.rooms?.hotels?.id === hotelId)?.rooms?.hotels?.title ?? hotelId;

    for (const adj of input.adjustments) {
        if (!inRange(adj.date)) continue;
        const row = ensure(adj.hotel_id, titleOf(adj.hotel_id));
        if (adj.direction === 'we_owe_hotel') row.adjustmentsWeOwe = round2(row.adjustmentsWeOwe + Number(adj.amount));
        else row.adjustmentsHotelOwes = round2(row.adjustmentsHotelOwes + Number(adj.amount));
    }
    for (const payout of input.payouts) {
        if (!inRange(payout.paid_at)) continue;
        const row = ensure(payout.hotel_id, titleOf(payout.hotel_id));
        row.paid = round2(row.paid + Number(payout.amount));
    }

    for (const row of byHotel.values()) {
        row.balance = round2(row.weOweHotel + row.adjustmentsWeOwe - row.hotelOwesUs - row.adjustmentsHotelOwes - row.paid);
        row.bookings.sort((a, b) => a.reserve.end - b.reserve.end);
    }

    return [...byHotel.values()].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.hotelTitle.localeCompare(b.hotelTitle, 'ru'));
};

export const totals = (rows: HotelSummary[]) =>
    rows.reduce(
        (acc, r) => ({
            bookingsCount: acc.bookingsCount + r.bookingsCount,
            gross: round2(acc.gross + r.gross),
            prepaid: round2(acc.prepaid + r.prepaid),
            ourFee: round2(acc.ourFee + r.ourFee),
            weOweHotel: round2(acc.weOweHotel + r.weOweHotel),
            hotelOwesUs: round2(acc.hotelOwesUs + r.hotelOwesUs),
            paid: round2(acc.paid + r.paid),
            balance: round2(acc.balance + r.balance),
        }),
        { bookingsCount: 0, gross: 0, prepaid: 0, ourFee: 0, weOweHotel: 0, hotelOwesUs: 0, paid: 0, balance: 0 },
    );

/** Границы периода: неделя пн–вс, содержащая день; месяц — календарный. */
export const periodFor = (day: number, kind: 'week' | 'month', shift = 0): { fromDay: number; toDay: number } => {
    if (kind === 'week') {
        const date = new Date(day * DAY * 1000);
        const weekday = (date.getUTCDay() + 6) % 7; // пн = 0
        const monday = day - weekday + shift * 7;

        return { fromDay: monday, toDay: monday + 6 };
    }
    const date = new Date(day * DAY * 1000);
    const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + shift, 1));
    const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));

    return { fromDay: Math.floor(first.getTime() / 1000 / DAY), toDay: Math.floor(next.getTime() / 1000 / DAY) - 1 };
};

export const formatMoney = (value: number): string =>
    `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(value))} ₽`;

export const formatDay = (day: number): string => {
    const date = new Date(day * DAY * 1000);

    return `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`;
};
