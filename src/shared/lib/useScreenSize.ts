import { useState, useEffect } from 'react';

export const useScreenSize = () => {
    const [screenSize, setScreenSize] = useState<'s' | 'm'>('s');

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth <= 1365) {
                setScreenSize('s');
            } else {
                setScreenSize('m');
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return { screenSize, isMobile: screenSize === 's' };
};
