'use client';
import { useUnit } from 'effector-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { $filters, initFiltersFromQuery, serializeFiltersToQuery } from '../model';

/**
 * Невидимый компонент для синхронизации стора фильтров и query string
 * Не меняет UI, достаточно подключить один раз на странице/лейауте
 */
export const FiltersSync = () => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const filters = useUnit($filters);

    const isInit = useRef(false);

    // Гидратация при первом монтировании
    useEffect(() => {
        if (isInit.current) return;
        isInit.current = true;
        initFiltersFromQuery(searchParams);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Стор → URL
    useEffect(() => {
        const query = serializeFiltersToQuery(filters);
        const sp = new URLSearchParams(query);
        const next = `${pathname}?${sp.toString()}`;
        router.replace(next, { scroll: false });
    }, [filters, pathname, router]);

    return null;
};
