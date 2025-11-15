import { useLayoutEffect, useState } from 'react';

export const useDeviceDetection = () => {
    const [device, setDevice] = useState({
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        os: 'unknown' as 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown',
        isTouchDevice: false,
    });

    useLayoutEffect(() => {
        const ua = navigator.userAgent.toLowerCase();
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        // Определение ОС
        let os: typeof device.os = 'unknown';
        if (/iphone|ipad|ipod/.test(ua)) os = 'ios';
        else if (/android/.test(ua)) os = 'android';
        else if (/win/.test(ua)) os = 'windows';
        else if (/mac/.test(ua)) os = 'macos';
        else if (/linux/.test(ua)) os = 'linux';

        // Определение типа устройства
        const isMobile = /mobile|iphone|ipod|android.*mobile/.test(ua);
        const isTablet = /tablet|ipad|android(?!.*mobile)/.test(ua);

        setDevice({
            isMobile,
            isTablet,
            isDesktop: !isMobile && !isTablet,
            os,
            isTouchDevice,
        });
    }, []);

    return device;
};
