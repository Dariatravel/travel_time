import { useLayoutEffect, useState } from 'react';

export const useScreenSize = () => {
    const [screenSize, setScreenSize] = useState<'phone' | 'tablet' | 'desktop'>('phone');

    useLayoutEffect(() => {
        const handleResize = () => {
            if (window.innerWidth <= 767) {
                setScreenSize('phone');
            } else if (window.innerWidth <= 1365) {
                setScreenSize('tablet');
            } else {
                setScreenSize('desktop');
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return {
        screenSize,
        isPhone: screenSize === 'phone',
        isTablet: screenSize === 'tablet',
        isDesktop: screenSize === 'desktop',
        isMobile: screenSize !== 'desktop',
    };
};
