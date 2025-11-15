'use client';
import { Navbar, NavbarNavItem } from '@/features/NavBar';
import { useSignOut } from '@/shared/api/auth/auth';
import { PagesEnum, routes } from '@/shared/config/routes';
import { useAuth } from '@/shared/lib/useAuth';
import { $user } from '@/shared/models/auth';
import { useUnit } from 'effector-react';
import { Building2, Calendar, HomeIcon } from 'lucide-react';
import moment from 'moment/moment';
import { useRouter } from 'next/navigation';
import React from 'react';
import styles from './layout.module.scss';

export interface LayoutProps {
    children?: React.ReactNode;
    className?: string;
}

moment.locale('ru');

const navLink: NavbarNavItem[] = [
    { href: routes[PagesEnum.MAIN], label: 'Главная', icon: HomeIcon, active: true },
    { href: routes[PagesEnum.HOTELS], label: 'Отели', icon: Building2 },
    { href: routes[PagesEnum.RESERVATION], label: 'Бронирование', icon: Calendar },
];

export default function MainLayout({ children }: LayoutProps) {
    useAuth();
    const currentDate = moment().locale('ru').format('dddd, D MMMM YYYY');

    const { mutate: signOut } = useSignOut();
    const router = useRouter();

    const onItemClick = async (item: string) => {
        console.log(item);
        if (item === 'logout') {
            await signOut();
            router.push(routes[PagesEnum.LOGIN]);
        }
    };

    const user = useUnit($user);

    console.log(user);
    return (
        <>
            <div className="relative w-full">
                <Navbar
                    navigationLinks={navLink}
                    currentDate={currentDate}
                    onUserItemClick={onItemClick}
                    user={user}
                />
            </div>
            <div>
                <div className={styles.contentContainer}>
                    <div className={`${styles.content} bg-transparent`}>
                        <div className={styles.childrenContainer}>{children}</div>
                    </div>
                </div>
            </div>
        </>
    );
}
