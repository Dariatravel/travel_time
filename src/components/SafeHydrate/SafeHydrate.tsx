'use client';

import { ReactNode, useEffect, useState } from 'react';

export function SafeHydrate({ children }: { children: ReactNode }) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    return <div suppressHydrationWarning>{isMounted ? children : null}</div>;
}
