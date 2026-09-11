/**
 * Ваучер брони — чистые функции без React и без сети.
 *
 * Тексты и порядок строк повторяют шаблоны OKO CRM (Ваучер.docx,
 * Ваучер_невозвратный.docx, Перенос_брони.docx). Метки вида «Заезд:»,
 * «Контактные данные гостя:», «К оплате при заселении:» менять нельзя —
 * по ним программа напоминаний разбирает PDF из чата «Королева Абхазии»
 * (см. abhazbereg-ideas/ВАУЧЕР-спецификация.md).
 */

import { parsePrepayment } from '@/shared/lib/parsePrepayment';

export type VoucherKind = 'standard' | 'nonrefundable';
export type BookingStatus = 'booked' | 'changed' | 'transferred' | 'cancelled';

export const BOOKING_SOURCES = ['Avito', 'VK', 'WhatsApp', 'Telegram', 'Max'] as const;
export const PAYMENT_BANKS = [
    'Райффайзенбанка',
    'Альфа-банка',
    'Сбербанка',
    'ВТБ',
    'Т-банка',
    'Озон-банка',
    'Совкомбанка',
    'Челябинвестбанка',
    'Рокетбанка',
    'ПСБ',
    'ОТП',
    'Газпромбанка',
] as const;

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
    booked: 'Бронь',
    changed: 'Изменена',
    transferred: 'Перенесена',
    cancelled: 'Отменена',
};

/**
 * Подпись менеджера в ваучере — как в шаблонах OKO. Телефон задаётся
 * переменной сборки NEXT_PUBLIC_VOUCHER_MANAGER_LINE (репозиторий публичный,
 * номер в коде не держим); без неё — подпись без телефона.
 */
export const MANAGER_LINE =
    process.env.NEXT_PUBLIC_VOUCHER_MANAGER_LINE?.trim() || 'Ваш менеджер: Дарья WhatsApp/Telegram/MAX';

/** Строка карточки брони (таблица public.booking_cards). */
export type BookingCardRow = {
    reserve_id: string;
    status: BookingStatus;
    source: string | null;
    manager: string | null;
    voucher_kind: VoucherKind;
    payment_bank: string | null;
    payment_date: string | null; // YYYY-MM-DD
    payment_phone: string | null;
    service_note: string | null;
    voucher_generated_at: string | null;
    chat_sent_at: string | null;
    hotel_notified_at: string | null;
    client_sent_at: string | null;
    voucher_path: string | null;
    created_at?: string;
    created_by?: string | null;
    updated_at?: string;
    updated_by?: string | null;
};

export type VoucherReserve = {
    guest: string;
    phone: string;
    start: number | Date;
    end: number | Date;
    price: number;
    quantity: number;
    prepayment?: number | string | null;
    comment?: string | null;
};

export type VoucherHotel = {
    title: string;
    type?: string | null;
    address?: string | null;
    phone?: string | null;
};

export type VoucherRoom = { title?: string | null };

export type VoucherInput = {
    reserve: VoucherReserve;
    hotel: VoucherHotel;
    room?: VoucherRoom | null;
    card?: Partial<BookingCardRow> | null;
};

export type VoucherModel = {
    kind: VoucherKind;
    hotelHeader: string[];
    hotelTitle: string;
    roomTitle: string;
    checkIn: string;
    checkOut: string;
    guest: string;
    phone: string;
    people: number;
    pricePerNight: number;
    nights: number;
    serviceNote: string;
    total: number;
    prepaid: number;
    toPay: number;
    paymentLine: string;
    comment: string;
    conditions: string[];
    managerLine: string;
};

const MOSCOW_OFFSET_SECONDS = 3 * 3600;

const toUnix = (value: number | Date): number =>
    typeof value === 'number' ? value : Math.floor(value.getTime() / 1000);

/** Дата по Москве в формате ДД.ММ.ГГГГ — бронь хранит момент 14:00/12:00 МСК. */
export const formatMoscowDate = (value: number | Date): string => {
    const shifted = new Date((toUnix(value) + MOSCOW_OFFSET_SECONDS) * 1000);
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');

    return `${day}.${month}.${shifted.getUTCFullYear()}`;
};

const moscowDayIndex = (value: number | Date) =>
    Math.floor((toUnix(value) + MOSCOW_OFFSET_SECONDS) / 86400);

/** Количество ночей — по календарным дням в Москве, как в шахматке. */
export const countNights = (start: number | Date, end: number | Date): number =>
    Math.max(0, moscowDayIndex(end) - moscowDayIndex(start));

// Единая точка приведения денег — та же, что у формы брони и экспорта.
const toMoney = parsePrepayment;

/** «12 000» — разряды через неразрывный пробел; парсер напоминаний цифры не теряет. */
export const formatMoney = (value: number): string =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(value));

const formatPaymentDate = (iso: string | null | undefined): string => {
    if (!iso) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);

    return match ? `${match[3]}.${match[2]}.${match[1]}` : iso;
};

/**
 * Шапка отеля. Парсер напоминаний ждёт «Абхазия,» и «Тел:» до строки
 * «Ваучер На Проживание» — поэтому обе строки печатаются ВСЕГДА, даже если
 * адрес или телефон пусты (тогда карточка отеля не заполнена — см.
 * voucherHotelProblems, модалка такой ваучер не выпускает).
 */
export const buildHotelHeader = (hotel: VoucherHotel): string[] => {
    const type = (hotel.type ?? '').trim();
    const title = type ? `${type} «${hotel.title}»` : `«${hotel.title}»`;
    const address = (hotel.address ?? '').trim();
    const addressLine = /^абхазия\s*,/i.test(address) ? address : `Абхазия, ${address}`;
    const phone = (hotel.phone ?? '').trim();

    return [title, addressLine, `Тел: ${phone}`];
};

/** Чего не хватает в карточке отеля, чтобы ваучер прочитала ночная программа. */
export const voucherHotelProblems = (hotel: VoucherHotel): string[] => {
    const problems: string[] = [];
    if (!(hotel.address ?? '').trim()) problems.push('нет адреса отеля');
    if (!(hotel.phone ?? '').trim()) problems.push('нет телефона отеля');

    return problems;
};

const STANDARD_CONDITIONS = [
    'До заселения гостем вносится полная стоимость проживания наличным платежом или переводом на карту, сумма указана в графе «К оплате при заселении»',
    'Бронирование является гарантированным.',
    '',
    'Правила отмены бронирования: при отмене за 30 дней и более до даты заезда, и невозможности заехать либо перенести дату заезда, возвращается 50% от суммы услуги бронирования. При отмене менее чем за 30 дней до заезда - возврата нет.',
    'Любые изменения в бронировании, отмена и перенос даты фиксируются в личной переписке посредством мессенджера.',
];

const NONREFUNDABLE_CONDITIONS = [
    'До заселения гостем вносится полная стоимость проживания наличным платежом или переводом на карту, сумма указана в графе «К оплате при заселении»',
    'Бронирование является гарантированным. При отмене бронирования, невозможности заехать либо перенести дату заезда сумма услуги бронирования не возвращается.',
    '',
    'Любые изменения в бронировании, отмена и перенос даты фиксируются в личной переписке посредством мессенджера.',
];

export const buildVoucher = ({ reserve, hotel, room, card }: VoucherInput): VoucherModel => {
    const kind: VoucherKind = card?.voucher_kind === 'nonrefundable' ? 'nonrefundable' : 'standard';
    const nights = countNights(reserve.start, reserve.end);
    const pricePerNight = toMoney(reserve.price);
    const total = pricePerNight * nights;
    const prepaid = toMoney(reserve.prepayment);
    const bank = (card?.payment_bank ?? '').trim();
    const paymentDate = formatPaymentDate(card?.payment_date);
    const paymentPhone = (card?.payment_phone ?? '').trim();
    const paymentLine = [
        'Перевод на карту',
        bank,
        paymentDate,
        paymentPhone ? `по номеру телефона ${paymentPhone}` : '',
    ]
        .filter(Boolean)
        .join(' ');

    return {
        kind,
        hotelHeader: buildHotelHeader(hotel),
        hotelTitle: hotel.title,
        roomTitle: (room?.title ?? '').trim(),
        checkIn: formatMoscowDate(reserve.start),
        checkOut: formatMoscowDate(reserve.end),
        guest: reserve.guest.trim(),
        phone: reserve.phone.trim(),
        people: reserve.quantity,
        pricePerNight,
        nights,
        serviceNote: (card?.service_note ?? '').trim(),
        total,
        prepaid,
        toPay: Math.max(0, total - prepaid),
        paymentLine,
        comment: (reserve.comment ?? '').trim(),
        conditions: kind === 'nonrefundable' ? NONREFUNDABLE_CONDITIONS : STANDARD_CONDITIONS,
        managerLine: MANAGER_LINE,
    };
};

/** Строки ваучера в порядке печати — и для PDF, и для проверки в тестах. */
export const voucherLines = (v: VoucherModel): string[] => [
    ...v.hotelHeader,
    '',
    'Ваучер На Проживание',
    `Заезд: ${v.checkIn} после 14.00.   Выезд: ${v.checkOut} до 12.00.`,
    `Контактные данные гостя: ${v.guest}`,
    `Номер телефона гостя: ${v.phone}`,
    'Детали бронирования:',
    `Количество человек в номере: ${v.people}`,
    `Стоимость номера за сутки: ${formatMoney(v.pricePerNight)}`,
    `Количество ночей: ${v.nights}`,
    `Услуга закрепления выбранного номера: ${v.serviceNote || '—'}`,
    `Общая стоимость бронирования: ${formatMoney(v.total)}₽`,
    `Оплачено гостем (услуга бронирования): ${formatMoney(v.prepaid)}₽`,
    v.paymentLine,
    `Комментарий: ${v.comment || '—'}`,
    `К оплате при заселении: ${formatMoney(v.toPay)}₽`,
    '',
    ...v.conditions,
    v.managerLine,
];

/** Ваучер на перенос — короткий документ без дат и сумм проживания. */
export const transferVoucherLines = (v: VoucherModel, seasonYear: number): string[] => [
    ...v.hotelHeader,
    '',
    'Ваучер на перенос бронирования',
    `Контактные данные гостя: ${v.guest}`,
    `Номер телефона гостя: ${v.phone}`,
    `Ваучер на невозвратную сумму ${formatMoney(v.prepaid)}₽ даёт возможность предъявителю потратить его на проживание именно в указанном объекте размещения в текущем сезоне ${seasonYear} года, либо следующем сезоне ${seasonYear + 1} года при наличии свободных мест и предварительном бронировании от 7 дней.`,
    'Стоимость проживания будет рассчитана в соответствии с тарифом выбранного месяца, в соответствии с текущими ценами.',
    'Услуга выбора номера: по наличию свободных мест.',
    `Оплачено гостем (услуга бронирования): ${formatMoney(v.prepaid)}₽`,
    '',
    v.managerLine,
];

const safeFileName = (value: string) =>
    value
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/** Имя файла — по сложившейся практике менеджеров (см. спецификацию, §3). */
export const voucherFileName = (v: VoucherModel, copyIndex = 0): string => {
    const year = v.checkIn.slice(-4);
    const suffix = copyIndex > 0 ? ` (${copyIndex + 1})` : '';
    const base =
        v.kind === 'nonrefundable'
            ? `Ваучер нв ${v.guest}`
            : `Ваучер_${year}_${v.hotelTitle}_${v.guest}`;

    return `${safeFileName(base)}${suffix}.pdf`;
};

export const transferVoucherFileName = (v: VoucherModel): string =>
    `${safeFileName(`Перенос брони ${v.guest}`)}.pdf`;

/** Подпись к файлу в чате «Королева Абхазии» — хештег читает программа напоминаний. */
export const chatCaption = (
    v: VoucherModel,
    kind: 'booking' | 'cancel' | 'transfer' | 'change',
): string => {
    const tag = { booking: '#бронь', cancel: '#отмена', transfer: '#перенос', change: '#изменения' }[
        kind
    ];

    return `${tag} ${v.hotelTitle} · ${v.guest} · ${v.checkIn}–${v.checkOut}`;
};

/** Текст отельеру — в OKO отдельного шаблона нет, отелю уходит тот же ваучер. */
export const hotelierMessage = (v: VoucherModel): string =>
    [
        `Бронь: ${v.guest}`,
        `Заезд ${v.checkIn}, выезд ${v.checkOut} (${v.nights} ноч.)`,
        v.roomTitle ? `Номер: ${v.roomTitle}` : '',
        `Гостей: ${v.people}`,
        `Тариф: ${formatMoney(v.pricePerNight)} ₽/сутки, всего ${formatMoney(v.total)} ₽`,
        `Предоплата ${formatMoney(v.prepaid)} ₽ внесена нам, к оплате на месте ${formatMoney(v.toPay)} ₽`,
        'Ваучер во вложении. Подтвердите, пожалуйста, что бронь принята.',
    ]
        .filter(Boolean)
        .join('\n');

/** Реплика клиенту вместе с ваучером — самая частая формулировка менеджеров. */
export const CLIENT_CHECK_MESSAGE =
    'Посмотрите, пожалуйста, открывается ли у вас файл и верно ли указала ваши данные - даты, ФИО и т д';

export type BookingStep = 'voucher' | 'chat' | 'chessmate' | 'hotel';

export const BOOKING_STEP_LABELS: Record<BookingStep, string> = {
    voucher: 'Ваучер',
    chat: '#бронь в чат',
    chessmate: 'Шахматка',
    hotel: 'Отельеру',
};

/** Какие из четырёх обязательных действий уже выполнены. */
export const bookingSteps = (
    card: Partial<BookingCardRow> | null | undefined,
    reserveCreatedAt?: string | null,
): Record<BookingStep, string | null> => ({
    voucher: card?.voucher_generated_at ?? null,
    chat: card?.chat_sent_at ?? null,
    chessmate: reserveCreatedAt ?? null,
    hotel: card?.hotel_notified_at ?? null,
});

export const missingSteps = (steps: Record<BookingStep, string | null>): BookingStep[] =>
    (Object.keys(steps) as BookingStep[]).filter((step) => !steps[step]);
