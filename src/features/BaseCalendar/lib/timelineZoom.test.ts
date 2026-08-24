import { describe, expect, it } from 'vitest';

import { getInitialZoomFactor } from './timelineZoom';

// Окно по умолчанию: компьютер ±7 дней (14), планшет ±6 (13).
const DESKTOP_WINDOW_DAYS = 14;
const TABLET_WINDOW_DAYS = 13;

describe('getInitialZoomFactor', () => {
    it('на компьютере окно не растягивает — менеджерам нужна ближняя неделя', () => {
        const factor = getInitialZoomFactor({ isPhone: false, isMobile: false });

        expect(factor).toBeNull();
        expect(DESKTOP_WINDOW_DAYS * (factor ?? 1)).toBe(14);
    });

    it('не возвращает 3.5: с ним шахматка открывалась на 49 дней', () => {
        const factor = getInitialZoomFactor({ isPhone: false, isMobile: false }) ?? 1;

        expect(DESKTOP_WINDOW_DAYS * factor).toBeLessThanOrEqual(21);
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
