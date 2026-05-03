'use client';

import { createContext, useContext, type ReactNode } from 'react';

/** Scrollable `.content` в MainLayout (max-width 1365px); на десктопе null — скролл у document. */
export const MainScrollContext = createContext<HTMLDivElement | null>(null);

export function MainScrollProvider({
    scrollElement,
    children,
}: {
    scrollElement: HTMLDivElement | null;
    children: ReactNode;
}) {
    return <MainScrollContext.Provider value={scrollElement}>{children}</MainScrollContext.Provider>;
}

export function useMainScrollElement() {
    return useContext(MainScrollContext);
}
