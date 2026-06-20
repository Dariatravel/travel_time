import { getReserveFormNightCount } from '@/features/ReserveInfo/lib/reserveDateForm';
import dayjs from 'dayjs';

export type ReserveExportSheetRow = {
    'Дата заезда': string;
    'Дата выезда': string;
    Отель: string;
    Номер: string;
    'Стоимость номера': number;
    'Кол-во гостей': number;
    'ФИО гостя': string;
    'Телефон гостя': string;
    Комментарий: string;
    'Количество ночей': number;
    Итого: number;
    Внесено: number;
    Остаток: number;
    Создал: string;
    Изменил: string;
    'Дата создания': string;
    'Дата изменения': string;
};

type ReserveExportSource = {
    start: number;
    end: number;
    guest: string;
    phone: string;
    comment: string | null;
    price: number;
    quantity: number;
    prepayment: string | number | null;
    created_by: string | null;
    edited_by: string | null;
    created_at: string;
    edited_at: string | null;
    rooms: {
        title: string;
        hotels: { title: string | null } | null;
    } | null;
};

const formatUnixDate = (unix: number) => dayjs.unix(unix).format('DD.MM.YYYY');

const formatIsoDateTime = (value?: string | null) =>
    value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '';

const parsePrepayment = (value: string | number | null | undefined) => {
    if (value == null || value === '') {
        return 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const mapReserveToExportRow = (reserve: ReserveExportSource): ReserveExportSheetRow => {
    const checkIn = dayjs.unix(reserve.start).startOf('day').toDate();
    const checkOut = dayjs.unix(reserve.end).startOf('day').toDate();
    const nights = getReserveFormNightCount(checkIn, checkOut);
    const prepayment = parsePrepayment(reserve.prepayment);
    const total = nights * reserve.price;
    const remain = total - prepayment;

    return {
        'Дата заезда': formatUnixDate(reserve.start),
        'Дата выезда': formatUnixDate(reserve.end),
        Отель: reserve.rooms?.hotels?.title ?? '',
        Номер: reserve.rooms?.title ?? '',
        'Стоимость номера': reserve.price,
        'Кол-во гостей': reserve.quantity,
        'ФИО гостя': reserve.guest,
        'Телефон гостя': reserve.phone,
        Комментарий: reserve.comment ?? '',
        'Количество ночей': nights,
        Итого: total,
        Внесено: prepayment,
        Остаток: remain,
        Создал: reserve.created_by ?? '',
        Изменил: reserve.edited_by ?? '',
        'Дата создания': formatIsoDateTime(reserve.created_at),
        'Дата изменения': formatIsoDateTime(reserve.edited_at),
    };
};

export const RESERVE_EXPORT_COLUMNS: (keyof ReserveExportSheetRow)[] = [
    'Дата заезда',
    'Дата выезда',
    'Отель',
    'Номер',
    'Стоимость номера',
    'Кол-во гостей',
    'ФИО гостя',
    'Телефон гостя',
    'Комментарий',
    'Количество ночей',
    'Итого',
    'Внесено',
    'Остаток',
    'Создал',
    'Изменил',
    'Дата создания',
    'Дата изменения',
];
