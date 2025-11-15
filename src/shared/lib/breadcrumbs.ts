import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Интерфейс для элемента хлебных крошек
 */
export interface BreadcrumbItem {
    label: string;
    href?: string;
    isCurrentPage?: boolean;
}

/**
 * Маппинг путей к русским названиям
 */
const PATH_LABELS: Record<string, string> = {
    '/main': 'Главная',
    '/main/hotels': 'Отели',
    '/main/reservation': 'Бронирование',
    '/login': 'Вход',
    '/advanced-filters': 'Расширенные фильтры',
};

/**
 * Генерирует хлебные крошки на основе текущего пути
 */
export function generateBreadcrumbs(pathname: string, hotelName?: string): BreadcrumbItem[] {
    const segments = pathname.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [];

    // Всегда добавляем главную страницу
    breadcrumbs.push({
        label: 'Главная',
        href: '/main',
    });

    let currentPath = '';

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        currentPath += `/${segment}`;

        // Получаем название для текущего сегмента
        let label = PATH_LABELS[currentPath];

        // Если это динамический сегмент (например, ID отеля), пытаемся получить название из контекста
        if (!label) {
            // Для динамических маршрутов отелей
            if (currentPath.match(/^\/main\/hotels\/[^\/]+$/)) {
                label = hotelName || 'Номера отеля';
            } else if (currentPath.match(/^\/main\/reservation\/[^\/]+$/)) {
                label = 'Бронирование';
            } else {
                // Fallback - используем сегмент как есть
                label = segment.charAt(0).toUpperCase() + segment.slice(1);
            }
        }

        const isLast = i === segments.length - 1;

        breadcrumbs.push({
            label,
            href: isLast ? undefined : currentPath,
            isCurrentPage: isLast,
        });
    }

    return breadcrumbs;
}

/**
 * Хук для получения хлебных крошек с поддержкой динамических данных
 */
export function useBreadcrumbs(): BreadcrumbItem[] {
    const pathname = usePathname();
    const params = useParams();
    const [hotelName, setHotelName] = useState<string | undefined>();

    // Получаем название отеля для динамических маршрутов
    useEffect(() => {
        if (pathname.match(/^\/main\/hotels\/[^\/]+$/) && params?.slug) {
            // Здесь можно добавить логику для получения названия отеля
            // Пока оставляем undefined, чтобы использовать fallback
            setHotelName(undefined);
        } else {
            setHotelName(undefined);
        }
    }, [pathname, params?.slug]);

    return generateBreadcrumbs(pathname, hotelName);
}
