'use client';
import { Text } from '@/components/ui/typography';
import { PagesEnum, routes } from '@/shared/config/routes';
// Flex заменен на Tailwind CSS
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { FaRegCalendar } from 'react-icons/fa';
import { IoMdHome } from 'react-icons/io';
import { LuChartNoAxesCombined } from 'react-icons/lu';
import cx from './style.module.scss';

const pages: { label: string; icon: React.ReactNode; href: string }[] = [
    {
        label: 'Главная',
        icon: <IoMdHome color="#7C918F" size={24} />,
        href: routes[PagesEnum.MAIN],
    },
    {
        label: 'Отели',
        icon: <FaRegCalendar color="#7C918F" size={24} />,
        href: routes[PagesEnum.HOTELS],
    },
    {
        label: 'Бронирование',
        icon: <LuChartNoAxesCombined color="#7C918F" size={24} />,
        href: routes[PagesEnum.RESERVATION],
    },
    {
        label: 'Расширенные фильтры',
        icon: <LuChartNoAxesCombined color="#7C918F" size={24} />,
        href: routes[PagesEnum.ADVANCED_FILTERS],
    },
];

export const TravelMenu = () => {
    const pathname = usePathname();

    const params = useParams();

    return (
        <div className={cx.layout}>
            {pages.map((page, index) => {
                const slicedPathname = params?.slug
                    ? pathname?.replace(`/${params?.slug}`, '')
                    : pathname;
                const isActive = slicedPathname === page?.href;

                return (
                    <Link
                        href={page?.href}
                        className={`${cx.link} ${isActive ? cx.active : ''}`}
                        key={index}
                        prefetch={false}
                    >
                        <div className={cx.container}>
                            <div className="flex flex-col items-center">
                                <div className={cx.icon}>{page?.icon}</div>
                                <Text>{page.label}</Text>
                            </div>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
};
