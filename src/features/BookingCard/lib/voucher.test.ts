import { describe, expect, it } from 'vitest';

import {
    bookingSteps,
    buildHotelHeader,
    buildVoucher,
    chatCaption,
    countNights,
    formatMoscowDate,
    hotelierMessage,
    missingSteps,
    transferVoucherFileName,
    transferVoucherLines,
    voucherFileName,
    voucherLines,
} from './voucher';

// 19.09.2026 14:00 МСК и 24.09.2026 12:00 МСК — как хранит шахматка.
const CHECK_IN = Date.UTC(2026, 8, 19, 11, 0) / 1000;
const CHECK_OUT = Date.UTC(2026, 8, 24, 9, 0) / 1000;

const reserve = {
    guest: 'Иванова Анна Петровна',
    phone: '+7 900 000-00-00',
    start: CHECK_IN,
    end: CHECK_OUT,
    price: 4500,
    quantity: 2,
    prepayment: '9000',
    comment: 'вид на море',
};

const hotel = {
    title: 'Мулберри',
    type: 'Отель',
    address: 'г. Гагра, ул. Абазгаa, 65/2',
    phone: '+7 940 000-00-00 Диана',
};

const card = {
    voucher_kind: 'standard' as const,
    payment_bank: 'Сбербанка',
    payment_date: '2026-09-11',
    payment_phone: '+7 940 900-33-40',
    service_note: '',
};

describe('даты и ночи по Москве', () => {
    it('формат ДД.ММ.ГГГГ и число ночей по календарным дням', () => {
        expect(formatMoscowDate(CHECK_IN)).toBe('19.09.2026');
        expect(formatMoscowDate(CHECK_OUT)).toBe('24.09.2026');
        expect(countNights(CHECK_IN, CHECK_OUT)).toBe(5);
    });

    it('заезд в 23:30 МСК не «уезжает» на другой день', () => {
        // 23:30 МСК = 20:30 UTC того же дня
        const lateUnix = Date.UTC(2026, 8, 19, 20, 30) / 1000;
        expect(formatMoscowDate(lateUnix)).toBe('19.09.2026');
    });
});

describe('шапка отеля', () => {
    it('добавляет «Абхазия,» и «Тел:» — их ждёт парсер напоминаний', () => {
        expect(buildHotelHeader(hotel)).toEqual([
            'Отель «Мулберри»',
            'Абхазия, г. Гагра, ул. Абазгаa, 65/2',
            'Тел: +7 940 000-00-00 Диана',
        ]);
    });

    it('не дублирует страну, если она уже в адресе', () => {
        expect(buildHotelHeader({ ...hotel, address: 'Абхазия, г. Гагра' })[1]).toBe(
            'Абхазия, г. Гагра',
        );
    });
});

describe('обычный ваучер', () => {
    const model = buildVoucher({ reserve, hotel, room: { title: 'Стандарт' }, card });
    const lines = voucherLines(model);
    const text = lines.join('\n');

    it('считает суммы: тариф × ночи, доплата = всего − предоплата', () => {
        expect(model.total).toBe(22500);
        expect(model.prepaid).toBe(9000);
        expect(model.toPay).toBe(13500);
    });

    it('содержит все метки, по которым разбирается PDF', () => {
        for (const anchor of [
            'Ваучер На Проживание',
            'Заезд: 19.09.2026 после 14.00.   Выезд: 24.09.2026 до 12.00.',
            'Контактные данные гостя: Иванова Анна Петровна',
            'Номер телефона гостя: +7 900 000-00-00',
            'Количество человек в номере: 2',
            'Количество ночей: 5',
            'Оплачено гостем (услуга бронирования): 9',
            'Перевод на карту Сбербанка 11.09.2026 по номеру телефона +7 940 900-33-40',
            'Комментарий: вид на море',
            'Ваш менеджер: Дарья',
        ]) {
            expect(text).toContain(anchor);
        }
        // Суммы — с неразрывным пробелом между разрядами, цифры на месте.
        expect(text).toMatch(/Стоимость номера за сутки: 4 500/);
        expect(text).toMatch(/Общая стоимость бронирования: 22 500₽/);
        expect(text).toMatch(/К оплате при заселении: 13 500₽/);
    });

    it('шапка стоит раньше заголовка', () => {
        expect(text.indexOf('Тел:')).toBeLessThan(text.indexOf('Ваучер На Проживание'));
    });

    it('условия обычного ваучера — с правилом 50% за 30 дней', () => {
        expect(text).toContain('возвращается 50% от суммы услуги бронирования');
    });

    it('имя файла — как у менеджеров', () => {
        expect(voucherFileName(model)).toBe('Ваучер_2026_Мулберри_Иванова Анна Петровна.pdf');
        expect(voucherFileName(model, 1)).toBe(
            'Ваучер_2026_Мулберри_Иванова Анна Петровна (2).pdf',
        );
    });

    it('подпись в чат начинается с #бронь', () => {
        expect(chatCaption(model, 'booking')).toBe(
            '#бронь Мулберри · Иванова Анна Петровна · 19.09.2026–24.09.2026',
        );
        expect(chatCaption(model, 'cancel').startsWith('#отмена')).toBe(true);
    });

    it('текст отельеру содержит гостя, даты, суммы и просьбу подтвердить', () => {
        const message = hotelierMessage(model);
        expect(message).toContain('Иванова Анна Петровна');
        expect(message).toContain('Заезд 19.09.2026, выезд 24.09.2026 (5 ноч.)');
        expect(message).toContain('Номер: Стандарт');
        expect(message).toContain('к оплате на месте 13 500 ₽');
        expect(message).toContain('Подтвердите');
    });
});

describe('невозвратный ваучер', () => {
    const model = buildVoucher({
        reserve,
        hotel,
        card: { ...card, voucher_kind: 'nonrefundable' },
    });
    const text = voucherLines(model).join('\n');

    it('без правила 50%, с фразой о невозврате', () => {
        expect(text).not.toContain('возвращается 50%');
        expect(text).toContain('сумма услуги бронирования не возвращается');
    });

    it('имя файла с маркером «нв»', () => {
        expect(voucherFileName(model)).toBe('Ваучер нв Иванова Анна Петровна.pdf');
    });
});

describe('ваучер переноса', () => {
    const model = buildVoucher({ reserve, hotel, card });
    const lines = transferVoucherLines(model, 2026);
    const text = lines.join('\n');

    it('без дат проживания, с суммой предоплаты и сезонами', () => {
        expect(text).toContain('Ваучер на перенос бронирования');
        expect(text).not.toContain('Заезд:');
        expect(text).toContain('невозвратную сумму 9 000₽');
        expect(text).toContain('сезоне 2026 года, либо следующем сезоне 2027 года');
    });

    it('имя файла', () => {
        expect(transferVoucherFileName(model)).toBe(
            'Перенос брони Мулберри Иванова Анна Петровна.pdf',
        );
    });
});

describe('пустые поля', () => {
    it('без предоплаты и реквизитов ваучер всё равно собирается', () => {
        const model = buildVoucher({
            reserve: { ...reserve, prepayment: null, comment: null },
            hotel: { title: 'Парус', address: '', phone: '' },
            card: null,
        });
        const text = voucherLines(model).join('\n');
        expect(model.prepaid).toBe(0);
        expect(model.toPay).toBe(22500);
        expect(text).toContain('Перевод на карту\n');
        expect(text).toContain('Комментарий: —');
        expect(model.hotelHeader).toEqual(['«Парус»', 'Абхазия']);
    });

    it('запрещённые в имени файла символы вычищаются', () => {
        const model = buildVoucher({
            reserve: { ...reserve, guest: 'Гость/с:вопросом?' },
            hotel: { title: 'Отель "Y"' },
            card,
        });
        expect(voucherFileName(model)).toBe('Ваучер_2026_Отель Y _Гость с вопросом.pdf');
    });
});

describe('чек-лист четырёх действий', () => {
    it('шахматка считается сделанной, раз бронь есть; остальное — по отметкам', () => {
        const steps = bookingSteps(
            { voucher_generated_at: '2026-09-11T10:00:00Z', chat_sent_at: null },
            '2026-09-11T09:00:00Z',
        );
        expect(missingSteps(steps)).toEqual(['chat', 'hotel']);
    });

    it('без карточки не сделано ничего, кроме шахматки', () => {
        expect(missingSteps(bookingSteps(null, '2026-09-11T09:00:00Z'))).toEqual([
            'voucher',
            'chat',
            'hotel',
        ]);
    });
});
