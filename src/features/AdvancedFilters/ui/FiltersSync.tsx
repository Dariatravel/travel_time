'use client';
import { useUnit } from 'effector-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { QueryStringFilterEnum } from '../lib/types';
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
    const previousQueryRef = useRef<string>('');

    // Гидратация при первом монтировании
    useEffect(() => {
        if (isInit.current) return;
        isInit.current = true;
        initFiltersFromQuery(searchParams);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Стор → URL
    useEffect(() => {
        // Пропускаем, если ещё не инициализировано
        if (!isInit.current) return;

        const query = serializeFiltersToQuery(filters);

        // Отладочное логирование
        console.log('FiltersSync: serializeFiltersToQuery result:', query);
        console.log('FiltersSync: current filters state:', filters);

        const sp = new URLSearchParams(query);
        const newQuery = sp.toString();

        // Проверяем, изменились ли параметры расширенных фильтров
        // Чтобы избежать лишних обновлений URL
        if (previousQueryRef.current === newQuery) return;

        // Сохраняем текущие параметры URL, чтобы не перезаписать другие параметры
        const currentParams = new URLSearchParams(searchParams.toString());

        // Определяем ключи расширенных фильтров, чтобы не трогать параметры SearchForm
        const advancedFilterKeys = [
            QueryStringFilterEnum.CITY,
            QueryStringFilterEnum.BEACH_TYPE,
            QueryStringFilterEnum.BEACH_DISTANCE,
            QueryStringFilterEnum.EAT,
            QueryStringFilterEnum.PRICE,
            QueryStringFilterEnum.FEATURES,
            QueryStringFilterEnum.ROOM_FEATURES,
            QueryStringFilterEnum.ROOM_TYPE,
        ];

        // Удаляем только старые параметры расширенных фильтров
        advancedFilterKeys.forEach((key) => {
            currentParams.delete(key);
        });

        // Добавляем новые параметры расширенных фильтров
        Object.entries(query).forEach(([key, value]) => {
            if (value) {
                currentParams.set(key, value);
            }
        });

        const next = `${pathname}?${currentParams.toString()}`;

        console.log('FiltersSync: updating URL to:', next);

        previousQueryRef.current = newQuery;
        router.replace(next, { scroll: false });
    }, [filters, pathname, router, searchParams]);

    return null;
};
