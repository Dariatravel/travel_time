'use client';
import { PagesEnum, routes } from '@/shared/config/routes';
import { Text } from '@consta/uikit/Text';
import { Flex } from 'antd';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { FaRegCalendar } from 'react-icons/fa';
import { IoMdHome } from 'react-icons/io';
import { LuChartNoAxesCombined } from 'react-icons/lu';
import cx from './style.module.scss';

const pages = [
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
];

export const TravelMenu = () => {
    const pathname = usePathname();

    const params = useParams();

    return (
        <div className={cx.layout}>
            {pages.map((page, index) => {
                const slicedPathname = params?.slug ? pathname?.replace(`/${params?.slug}`, '') : pathname;
                const isActive = slicedPathname === page?.href;

                return (
                    <Link href={page?.href} className={`${cx.link} ${isActive ? cx.active : ''}`} key={index} prefetch={false}>
                        <div className={cx.container}>
                            <Flex vertical align="center">
                                <div className={cx.icon}>{page?.icon}</div>
                                <Text>{page.label}</Text>
                            </Flex>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
};
