// src/shared/config/EffectorLogger.tsx
'use client';
import { attachLogger } from 'effector-logger';
import { useEffect } from 'react';

export function EffectorLogger() {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'development') return;
        const detach = attachLogger();
        return () => detach();
    }, []);
    return null;
}
