/**
 * Финансы с отелями — чистые функции. Ничего не хранится: расчёт по броням
 * делается из reserves + booking_cards + deals + условий отеля (hotel_terms)
 * каждый раз, поэтому правка брони сразу меняет ведомость.
 *
 * Как сейчас устроено у Дарьи: предоплату почти всегда принимает она, отелю
 * переводит его долю по договорённости (у всех отелей — разные). Модели:
 *   prepay_is_fee      — вся предоплата = наша услуга бронирования, отелю ничего;
 *   share_pct          — отелю уходит hotel_share_pct % предоплаты;
 *   fixed_per_booking  — мы оставляем фикс за бронь, остальное отелю;
 *   fixed_per_night    — мы оставляем фикс за ночь, остальное отелю.
 * Доверенные отели (prepay_direct_to_hotel): клиент платит сразу отелю,
 * тогда уже отель должен нам нашу долю.
 *
 * Отель без условий в долг не считается (показывается «условия не заданы»),
 * чтобы устная договорённость не превратилась в молчаливый ноль.
 * Долг возникает по выезду гостя. Учёт — с даты начала (accounting_start):
 * всё, что раньше, закрыто руками в OKO. Остаток по отелю — накопленный:
 * все выезды с начала учёта по конец периода минус все выплаты.
 */

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
    deleted_at?: string | null;
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
    deleted_at?: string | null;
};

export type FinanceReserve = {
    id: string;
    guest: string;
    start: number;
    end: number;
    price: number;
    prepayment: string | number | null;
    external_source: string | null;
    rooms: { id: string; title: string; hotels: { id: string; title: string } | null } | null;
    booking_cards: { status: string } | { status: string }[] | null;
    deals?: { stage: string; pipeline: string } | { stage: string; pipeline: string }[] | null;
};

export type HotelRef = { id: string; title: string };

export type BookingCalc = {
    reserve: FinanceReserve;
    hotelId: string;
    hotelTitle: string;
    nights: number;
    gross: number; // тариф × ночи
    prepaid: number; // предоплата (услуга бронирования)
    prepaidUnknown: boolean; // в поле предоплаты что-то, что не удалось прочитать как число
    toPayOnSite: number; // доплата на месте — отелю напрямую
    termsKnown: boolean;
    ourFee: number | null; // наша доля из предоплаты (null — условия не заданы)
    hotelShare: number | null;
    weOweHotel: number; // мы должны отелю (предоплата у нас)
    hotelOwesUs: number; // отель должен нам (предоплата ушла отелю напрямую)
    statusUnknown: boolean; // нет ни карточки, ни сделки — статус не проверить
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
    /** Сальдо за период: + мы должны отелю, − отель должен нам (без выплат). */
    periodDue: number;
    /** Накопленный остаток с начала учёта по конец периода: + мы должны, − нам должны. */
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

/** Предоплата из текстового поля: «5 000», «5000 ₽», «5000руб» → 5000; мусор → NaN. */
export const parseMoney = (value: string | number | null | undefined): number => {
    if (value == null) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const text = value.trim();
    if (text === '') return 0;
    const cleaned = text.replace(/[\s₽]/g, '').replace(/руб\.?$/i, '').replace(/р\.?$/i, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;

    return Number(cleaned);
};

const first = <T>(value: T | T[] | null | undefined): T | null =>
    value == null ? null : Array.isArray(value) ? (value[0] ?? null) : value;

const CLOSED_DEAL_STAGES = new Set(['otkaz', 'vozvrat', 'nevozvratnaya_otmena', 'zayavka_na_vozvrat']);

/** Бронь считается: не внешняя, карточка не отменена/перенесена, сделка не в отказе/возврате. */
export const isCountable = (reserve: FinanceReserve): boolean => {
    if (reserve.external_source) return false;
    const card = first(reserve.booking_cards)?.status;
    if (card === 'cancelled' || card === 'transferred') return false;
    const deal = first(reserve.deals);
    if (deal && CLOSED_DEAL_STAGES.has(deal.stage)) return false;

    return true;
};

/** Наша доля из предоплаты по условиям отеля; null — условия не заданы. */
export const ourFeeFor = (terms: HotelTermsRow | null, prepaid: number, nights: number): number | null => {
    if (!terms) return null;
    const safe = Math.max(0, prepaid);
    switch (terms.model) {
        case 'share_pct':
            return round2(safe * (1 - Math.min(100, Math.max(0, Number(terms.hotel_share_pct ?? 0))) / 100));
        case 'fixed_per_booking':
            return round2(Math.min(safe, Math.max(0, Number(terms.fixed_amount ?? 0))));
        case 'fixed_per_night':
            return round2(Math.min(safe, Math.max(0, Number(terms.fixed_amount ?? 0)) * nights));
        default:
            return round2(safe);
    }
};

export const calcBooking = (reserve: FinanceReserve, terms: HotelTermsRow | null): BookingCalc | null => {
    const hotel = reserve.rooms?.hotels;
    if (!hotel) return null;
    const nights = Math.max(0, moscowDay(reserve.end) - moscowDay(reserve.start));
    const gross = round2(Math.max(0, Number(reserve.price ?? 0)) * nights);
    const parsed = parseMoney(reserve.prepayment);
    const prepaidUnknown = Number.isNaN(parsed);
    const prepaid = prepaidUnknown ? 0 : round2(Math.max(0, parsed));
    const ourFee = ourFeeFor(terms, prepaid, nights);
    const hotelShare = ourFee == null ? null : round2(Math.max(0, prepaid - ourFee));
    const direct = !!terms?.prepay_direct_to_hotel;

    return {
        reserve,
        hotelId: hotel.id,
        hotelTitle: hotel.title,
        nights,
        gross,
        prepaid,
        prepaidUnknown,
        toPayOnSite: round2(Math.max(0, gross - prepaid)),
        termsKnown: !!terms,
        ourFee,
        hotelShare,
        weOweHotel: ourFee == null || direct ? 0 : hotelShare ?? 0,
        hotelOwesUs: ourFee != null && direct ? ourFee : 0,
        statusUnknown: !first(reserve.booking_cards) && !first(reserve.deals),
    };
};

export type FinanceInput = {
    reserves: FinanceReserve[]; // все брони с выездом от начала учёта по конец периода
    hotels: HotelRef[];
    terms: HotelTermsRow[];
    payouts: PayoutRow[]; // с начала учёта по конец периода, без удалённых
    adjustments: AdjustmentRow[];
    startDay: number; // начало учёта
    fromDay: number;
    toDay: number;
};

const emptySummary = (hotelId: string, hotelTitle: string, terms: HotelTermsRow | null): HotelSummary => ({
    hotelId,
    hotelTitle,
    terms,
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
    periodDue: 0,
    balance: 0,
});

/**
 * Ведомость по отелям. Строки периода — по выезду в [fromDay, toDay];
 * накопленный остаток — по всему, что с начала учёта по toDay.
 */
export const buildStatement = (input: FinanceInput): HotelSummary[] => {
    const termsByHotel = new Map(input.terms.map((t) => [t.hotel_id, t]));
    const titleByHotel = new Map(input.hotels.map((h) => [h.id, h.title]));
    const byHotel = new Map<string, HotelSummary>();
    const cumulative = new Map<string, number>();
    const ensure = (hotelId: string, fallbackTitle?: string): HotelSummary => {
        let row = byHotel.get(hotelId);
        if (!row) {
            row = emptySummary(hotelId, titleByHotel.get(hotelId) ?? fallbackTitle ?? 'Отель без названия', termsByHotel.get(hotelId) ?? null);
            byHotel.set(hotelId, row);
        }

        return row;
    };
    const addCumulative = (hotelId: string, delta: number) => cumulative.set(hotelId, round2((cumulative.get(hotelId) ?? 0) + delta));

    for (const reserve of input.reserves) {
        if (!isCountable(reserve)) continue;
        const endDay = moscowDay(reserve.end);
        if (endDay < input.startDay || endDay > input.toDay) continue;
        const calc = calcBooking(reserve, termsByHotel.get(reserve.rooms?.hotels?.id ?? '') ?? null);
        if (!calc) continue;
        addCumulative(calc.hotelId, calc.weOweHotel - calc.hotelOwesUs);
        if (endDay < input.fromDay) continue;
        const row = ensure(calc.hotelId, calc.hotelTitle);
        row.bookings.push(calc);
        row.bookingsCount += 1;
        row.nights += calc.nights;
        row.gross = round2(row.gross + calc.gross);
        row.prepaid = round2(row.prepaid + calc.prepaid);
        row.ourFee = round2(row.ourFee + (calc.ourFee ?? 0));
        row.weOweHotel = round2(row.weOweHotel + calc.weOweHotel);
        row.hotelOwesUs = round2(row.hotelOwesUs + calc.hotelOwesUs);
    }

    for (const adj of input.adjustments) {
        if (adj.deleted_at) continue;
        const day = dayFromIsoDate(adj.date);
        if (day < input.startDay || day > input.toDay) continue;
        const signed = adj.direction === 'we_owe_hotel' ? Number(adj.amount) : -Number(adj.amount);
        addCumulative(adj.hotel_id, signed);
        if (day < input.fromDay) continue;
        const row = ensure(adj.hotel_id);
        if (signed > 0) row.adjustmentsWeOwe = round2(row.adjustmentsWeOwe + signed);
        else row.adjustmentsHotelOwes = round2(row.adjustmentsHotelOwes - signed);
    }
    for (const payout of input.payouts) {
        if (payout.deleted_at) continue;
        const day = dayFromIsoDate(payout.paid_at);
        if (day < input.startDay || day > input.toDay) continue;
        addCumulative(payout.hotel_id, -Number(payout.amount));
        if (day < input.fromDay) continue;
        const row = ensure(payout.hotel_id);
        row.paid = round2(row.paid + Number(payout.amount));
    }
    // Отели с ненулевым накопленным остатком показываем и без движений в периоде.
    for (const [hotelId, balance] of cumulative) {
        if (balance !== 0) ensure(hotelId);
    }

    for (const row of byHotel.values()) {
        row.periodDue = round2(row.weOweHotel + row.adjustmentsWeOwe - row.hotelOwesUs - row.adjustmentsHotelOwes);
        row.balance = cumulative.get(row.hotelId) ?? 0;
        row.bookings.sort((a, b) => a.reserve.end - b.reserve.end);
    }

    return [...byHotel.values()].sort(
        (a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.hotelTitle.localeCompare(b.hotelTitle, 'ru'),
    );
};

export type Totals = {
    bookingsCount: number;
    gross: number;
    prepaid: number;
    ourFee: number;
    weOweHotel: number;
    hotelOwesUs: number;
    paid: number;
    balanceWeOwe: number; // сумма положительных остатков
    balanceOwedToUs: number; // сумма отрицательных (по модулю)
    hotelsWithoutTerms: number;
};

export const totals = (rows: HotelSummary[]): Totals =>
    rows.reduce<Totals>(
        (acc, r) => ({
            bookingsCount: acc.bookingsCount + r.bookingsCount,
            gross: round2(acc.gross + r.gross),
            prepaid: round2(acc.prepaid + r.prepaid),
            ourFee: round2(acc.ourFee + r.ourFee),
            weOweHotel: round2(acc.weOweHotel + r.weOweHotel),
            hotelOwesUs: round2(acc.hotelOwesUs + r.hotelOwesUs),
            paid: round2(acc.paid + r.paid),
            balanceWeOwe: round2(acc.balanceWeOwe + Math.max(0, r.balance)),
            balanceOwedToUs: round2(acc.balanceOwedToUs + Math.max(0, -r.balance)),
            hotelsWithoutTerms: acc.hotelsWithoutTerms + (r.terms || r.bookingsCount === 0 ? 0 : 1),
        }),
        { bookingsCount: 0, gross: 0, prepaid: 0, ourFee: 0, weOweHotel: 0, hotelOwesUs: 0, paid: 0, balanceWeOwe: 0, balanceOwedToUs: 0, hotelsWithoutTerms: 0 },
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
    const firstDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + shift, 1));
    const next = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 1));

    return { fromDay: Math.floor(firstDay.getTime() / 1000 / DAY), toDay: Math.floor(next.getTime() / 1000 / DAY) - 1 };
};

/** Проверка условий перед сохранением — то же, что CHECK в базе, но с человеческим текстом. */
export const validateTerms = (terms: Pick<HotelTermsRow, 'model' | 'hotel_share_pct' | 'fixed_amount' | 'min_nights'>): string | null => {
    if (terms.model === 'share_pct') {
        if (terms.hotel_share_pct == null) return 'Укажите процент отелю';
        if (terms.hotel_share_pct < 0 || terms.hotel_share_pct > 100) return 'Процент должен быть от 0 до 100';
    }
    if (terms.model === 'fixed_per_booking' || terms.model === 'fixed_per_night') {
        if (terms.fixed_amount == null) return 'Укажите сумму фикса';
        if (terms.fixed_amount < 0) return 'Фикс не может быть отрицательным';
    }
    if (terms.min_nights != null && terms.min_nights <= 0) return 'Минимум ночей должен быть больше нуля';

    return null;
};

export const formatMoney = (value: number): string =>
    `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(value))} ₽`;

export const formatDay = (day: number): string => {
    const date = new Date(day * DAY * 1000);

    return `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`;
};
