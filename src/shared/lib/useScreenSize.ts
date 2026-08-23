import { useLayoutEffect, useState } from 'react';

export type ScreenSize = 'phone' | 'tablet' | 'desktop';

// Единственный способ определять размер экрана в проекте. Раньше их было три:
// этот хук, детект по user-agent и локальный расчёт в NavBar — они расходились
// (например, узкое окно десктопа по user-agent считалось десктопом, хотя вёрстка
// уже мобильная). Границы совпадают с брейкпоинтами вёрстки.
const PHONE_QUERY = '(max-width: 767px)';
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1365px)';

const detect = (): ScreenSize => {
    // SSR: до гидратации окна нет. Берём desktop — так первый кадр не «прыгает»
    // на широких экранах, где сидит большинство менеджеров.
    if (typeof window === 'undefined') return 'desktop';
    if (window.matchMedia(PHONE_QUERY).matches) return 'phone';
    if (window.matchMedia(TABLET_QUERY).matches) return 'tablet';
    return 'desktop';
};

export const useScreenSize = () => {
    const [screenSize, setScreenSize] = useState<ScreenSize>(detect);

    useLayoutEffect(() => {
        const sync = () => setScreenSize(detect());
        // matchMedia вместо resize: реагирует и на поворот экрана, и на смену
        // масштаба, и не срабатывает на каждый пиксель перетаскивания окна.
        const queries = [window.matchMedia(PHONE_QUERY), window.matchMedia(TABLET_QUERY)];

        sync();
        queries.forEach((query) => query.addEventListener('change', sync));

        return () => queries.forEach((query) => query.removeEventListener('change', sync));
    }, []);

    return {
        screenSize,
        isPhone: screenSize === 'phone',
        isTablet: screenSize === 'tablet',
        isDesktop: screenSize === 'desktop',
        /** Телефон или планшет — то есть любая нестационарная вёрстка. */
        isMobile: screenSize !== 'desktop',
    };
};
