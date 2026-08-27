import { describe, expect, it } from 'vitest';

import { getInitialZoomFactor } from './timelineZoom';

// Окно по умолчанию: компьютер ±7 дней (14), планшет ±6 (13).
const DESKTOP_WINDOW_DAYS = 14;
const TABLET_WINDOW_DAYS = 13;

describe('getInitialZoomFactor', () => {
    it('на компьютере даёт широкий обзор — так просила Дарья', () => {
        const factor = getInitialZoomFactor({ isPhone: false, isMobile: false });

        expect(factor).toBe(3.5);
        expect(DESKTOP_WINDOW_DAYS * (factor ?? 1)).toBe(49);
    });

    it('обзор не сужается до пары недель — пробовали, дат помещалось мало', () => {
        const factor = getInitialZoomFactor({ isPhone: false, isMobile: false }) ?? 1;

        expect(DESKTOP_WINDOW_DAYS * factor).toBeGreaterThan(30);
    });

    it('на планшете окно ужимает вдвое — экран узкий', () => {
        const factor = getInitialZoomFactor({ isPhone: false, isMobile: true });

        expect(factor).toBe(0.5);
        expect(TABLET_WINDOW_DAYS * (factor ?? 1)).toBeCloseTo(6.5);
    });

    it('телефон ведёт свой диапазон отдельно — зум не трогаем', () => {
        expect(getInitialZoomFactor({ isPhone: true, isMobile: true })).toBeNull();
    });
});
