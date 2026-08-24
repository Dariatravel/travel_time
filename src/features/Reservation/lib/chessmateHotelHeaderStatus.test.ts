import { describe, expect, it } from 'vitest';

import { getChessmateHotelHeaderStatus } from './chessmateHotelHeaderStatus';

describe('getChessmateHotelHeaderStatus', () => {
    it('«Грант» — голубой: занятость подтягивается из шахматки отельера', () => {
        expect(getChessmateHotelHeaderStatus('Грант отель')).toBe('mirror');
        expect(getChessmateHotelHeaderStatus('Грант коттеджи')).toBe('mirror');
        expect(getChessmateHotelHeaderStatus('Грант апартаменты')).toBe('mirror');
    });

    it('старый «Грант Grant» остаётся жёлтым — автосинка у него нет', () => {
        expect(getChessmateHotelHeaderStatus('Грант Grant ')).toBe('access');
    });

    it('зелёные ведут люди, голубые — робот', () => {
        expect(getChessmateHotelHeaderStatus('Райский берег')).toBe('active');
        expect(getChessmateHotelHeaderStatus('Джаннат')).toBe('mirror');
    });

    it('не знаем отель — статуса нет', () => {
        expect(getChessmateHotelHeaderStatus('Отель которого нет')).toBeUndefined();
        expect(getChessmateHotelHeaderStatus('')).toBeUndefined();
    });
});
