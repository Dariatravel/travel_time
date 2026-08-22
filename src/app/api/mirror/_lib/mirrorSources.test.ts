import { describe, expect, it } from 'vitest';
import { getExternalReserveSourceName } from './mirrorSources';

describe('getExternalReserveSourceName', () => {
    it.each([
        ['wps_villa_leona', undefined, 'Вилла Леона'],
        ['bnovo_djannat', undefined, 'Джаннат'],
        ['googlesheet_sunrise', undefined, 'Санрайз'],
        ['kontur_bookonline', undefined, 'Вилла Оазис'],
        ['ical_reservationsteps', 'Аврора Inn', 'Аврора Inn'],
        ['mirror_shelter', 'Нора', 'Нора'],
        ['realtycalendar_ical', undefined, 'RealtyCalendar'],
        ['unknown_source', undefined, 'unknown_source'],
    ])('для %s и отеля %s возвращает %s', (source, hotelTitle, expected) => {
        expect(getExternalReserveSourceName(source, hotelTitle)).toBe(expected);
    });
});
