'use client';
import { Navbar, NavbarNavItem } from '@/features/NavBar';
import { useSignOut } from '@/shared/api/auth/auth';
import { PagesEnum, routes } from '@/shared/config/routes';
import { isAdminRole } from '@/shared/lib/isAdmin';
import { isStaffRole } from '@/shared/lib/userRoles';
import { useAuth } from '@/shared/lib/useAuth';
import { $user } from '@/shared/models/auth';
import { useUnit } from 'effector-react';
import { Building2, Calendar, HomeIcon, LayoutDashboard, UserCog } from 'lucide-react';
import moment from 'moment/moment';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { ToastContainer } from 'react-toastify';
import { MainScrollProvider } from './MainScrollContext';
import styles from './layout.module.scss';

moment.locale('ru');

const baseNavLinks: NavbarNavItem[] = [
    { href: routes[PagesEnum.MAIN], label: 'Главная', icon: HomeIcon, active: true },
    { href: routes[PagesEnum.HOTELS], label: 'Отели', icon: Building2 },
    { href: routes[PagesEnum.RESERVATION], label: 'Бронирование', icon: Calendar },
];

export default function MainLayout({ children }: { children: React.ReactNode }) {
    const [mainScrollEl, setMainScrollEl] = useState<HTMLDivElement | null>(null);
    useAuth();
    const currentDate = moment().locale('ru').format('dddd, D MMMM YYYY');

    const { mutate: signOut } = useSignOut();
    const router = useRouter();

    const onItemClick = async (item: string) => {
        if (item === 'logout') {
            await signOut();
            router.push(routes[PagesEnum.LOGIN]);
        }
    };

    const user = useUnit($user);
    const staffLinks = isStaffRole(user?.role)
        ? [
              {
                  href: routes[PagesEnum.OPERATIONS],
                  label: 'Операционный центр',
                  icon: LayoutDashboard,
              },
          ]
        : [];

    const navigationLinks = isAdminRole(user?.role)
        ? [
              ...baseNavLinks,
              ...staffLinks,
              {
                  href: routes[PagesEnum.ADMIN_OPERATORS],
                  label: 'Операторы',
                  icon: UserCog,
              },
          ]
        : [...baseNavLinks, ...staffLinks];

    return (
        <>
            <div className="relative w-full">
                <Navbar
                    navigationLinks={navigationLinks}
                    currentDate={currentDate}
                    onUserItemClick={onItemClick}
                    user={user}
                />
            </div>
            <div>
                <div className={styles.contentContainer}>
                    <div ref={setMainScrollEl} className={`${styles.content} bg-transparent`}>
                        <MainScrollProvider scrollElement={mainScrollEl}>
                            <div className={styles.childrenContainer}>{children}</div>
                        </MainScrollProvider>
                    </div>
                </div>
            </div>
            <ToastContainer />
        </>
    );
}
