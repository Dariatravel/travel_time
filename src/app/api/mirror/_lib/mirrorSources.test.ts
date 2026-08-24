import { describe, expect, it } from 'vitest';
import { getExternalReserveSourceName, getMirrorSource } from './mirrorSources';

describe('getExternalReserveSourceName', () => {
    it.each([
        ['wps_villa_leona', undefined, 'Вилла Леона'],
        ['bnovo_djannat', undefined, 'Джаннат'],
        ['googlesheet_sunrise', undefined, 'Санрайз'],
        ['kontur_bookonline', undefined, 'Вилла Оазис'],
        ['ical_reservationsteps', 'Аврора Inn', 'Аврора Inn'],
        ['mirror_shelter', 'Нора', 'Нора'],
        ['realtycalendar_ical', undefined, 'RealtyCalendar'],
        ['xlsx_grant', 'Грант коттеджи', 'Грант коттеджи'],
        ['xlsx_grant', undefined, 'Таблица Гранта'],
        ['unknown_source', undefined, 'unknown_source'],
    ])('для %s и отеля %s возвращает %s', (source, hotelTitle, expected) => {
        expect(getExternalReserveSourceName(source, hotelTitle)).toBe(expected);
    });
});

// Кнопка «Обновить занятость» работает ровно тогда, когда у отеля есть источник.
describe('источники «Гранта»', () => {
    const HOTELS = {
        'Грант отель': 'f656cddc-43f9-4c3c-aa9f-2c1ecbe5e9a3',
        'Грант коттеджи': 'a9be6b0f-59d0-4915-be34-f793f96f56b6',
        'Грант апартаменты': 'b63e10ef-d4f6-4c3a-b8d6-aabd066a6e99',
    };

    it.each(Object.entries(HOTELS))('%s читает книгу из папки Drive', (_hotel, hotelId) => {
        const source = getMirrorSource(hotelId);

        expect(source?.system).toBe('grantxlsx');
        expect(source && 'folderId' in source ? source.folderId : undefined).toBeTruthy();
    });

    it('три объекта делят одну книгу и один тег меток', () => {
        const tags = Object.values(HOTELS).map((hotelId) => {
            const source = getMirrorSource(hotelId);
            return source && 'tag' in source ? source.tag : undefined;
        });

        expect(new Set(tags)).toEqual(new Set(['xlsx_grant']));
    });
});
