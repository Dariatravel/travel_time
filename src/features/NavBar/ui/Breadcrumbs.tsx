'use client';

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useHotelById } from '@/shared/api/hotel/hotel';
import { BreadcrumbItem as BreadcrumbItemType } from '@/shared/lib/breadcrumbs';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';

interface BreadcrumbsProps {
    className?: string;
}

export function Breadcrumbs({ className }: BreadcrumbsProps) {
    const pathname = usePathname();
    const params = useParams();
    const [hotelName, setHotelName] = useState<string | undefined>();

    // Получаем данные отеля для динамических маршрутов
    const isHotelPage = pathname.match(/^\/main\/hotels\/[^\/]+$/);
    const hotelId = isHotelPage && params?.slug ? (params.slug as string) : '';

    const { data: hotel } = useHotelById(hotelId);

    useEffect(() => {
        if (hotel?.title) {
            setHotelName(hotel.title);
        }
    }, [hotel?.title]);

    const breadcrumbs = generateBreadcrumbs(pathname, hotelName);

    if (breadcrumbs.length === 0) {
        return null;
    }

    return (
        <div className={className}>
            <Breadcrumb>
                <BreadcrumbList>
                    {breadcrumbs.map((breadcrumb, index) => (
                        <React.Fragment key={index}>
                            <BreadcrumbItem>
                                {breadcrumb.isCurrentPage ? (
                                    <BreadcrumbPage>{breadcrumb.label}</BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink asChild>
                                        <Link href={breadcrumb.href || '#'}>
                                            {breadcrumb.label}
                                        </Link>
                                    </BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                            {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                        </React.Fragment>
                    ))}
                </BreadcrumbList>
            </Breadcrumb>
        </div>
    );
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
function generateBreadcrumbs(pathname: string, hotelName?: string): BreadcrumbItemType[] {
    const segments = pathname.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItemType[] = [];

    // Если мы на главной странице /main, показываем только "Главная" как текущую страницу
    if (pathname === '/main' || pathname === '/main/') {
        return [
            {
                label: 'Главная',
                href: undefined,
                isCurrentPage: true,
            },
        ];
    }

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
