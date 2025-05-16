import { useState, useEffect, useLayoutEffect } from 'react';

export const useScreenSize = () => {
    const [screenSize, setScreenSize] = useState<'s' | 'm'>('s');

    useLayoutEffect(() => {
        const handleResize = () => {
            if (window.innerWidth <= 1365) {
                console.log('setScreenSize', 's', window.innerWidth);
                setScreenSize('s');
            } else {
                console.log('setScreenSize', 'm', window.innerWidth);
                setScreenSize('m');
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return { screenSize, isMobile: screenSize === 's' };
};
