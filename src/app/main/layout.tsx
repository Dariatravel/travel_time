'use client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Navbar, NavbarNavItem } from '@/features/NavBar';
import { SearchForm } from '@/features/Search';
import { Today } from '@/features/Today/Today';
import { cn } from '@/lib/utils';
import { PagesEnum, routes } from '@/shared/config/routes';
import { useAuth } from '@/shared/lib/useAuth';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { $hotelsFilter } from '@/shared/models/hotels';
import { setIsMobile } from '@/shared/models/mobile';
import { useUnit } from 'effector-react/compat';
import { Calendar, FileTextIcon, FilterIcon, HomeIcon } from 'lucide-react';
import moment from 'moment/moment';
import { usePathname } from 'next/navigation';
import React, { useLayoutEffect, useState } from 'react';
import styles from './layout.module.scss';

export interface LayoutProps {
    children?: React.ReactNode;
    className?: string;
}

moment.locale('ru');

const navLink: NavbarNavItem[] = [
    { href: routes[PagesEnum.MAIN], label: 'Главная', icon: HomeIcon, active: true },
    { href: routes[PagesEnum.HOTELS], label: 'Отели', icon: FileTextIcon },
    { href: routes[PagesEnum.RESERVATION], label: 'Бронирование', icon: Calendar },
];

export default function MainLayout({ children }: LayoutProps) {
    useAuth();
    const currentDate = moment().locale('ru').format('dddd, D MMMM YYYY');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const isReservationSlug = usePathname().includes('reservation/');
    const filter = useUnit($hotelsFilter);
    const [onSetIsMobile] = useUnit([setIsMobile]);
    const { isMobile } = useScreenSize();

    const onToggleFilter = (state: boolean) => {
        setIsFilterOpen(state);
    };
    useLayoutEffect(() => {
        onSetIsMobile(isMobile);
    }, [isMobile]);

    return (
        <div>
            <div className="relative w-full">
                <Navbar navigationLinks={navLink} />
            </div>
            {/* <LayoutExampleBig /> */}
            <div>
                <div className={styles.contentContainer}>
                    <div className={cn(styles.content, 'bg-transparent')}>
                        <div className="grid grid-cols-[1fr_400px] gap-1">
                            <div className="w-full">
                                {isMobile ? (
                                    <Drawer
                                        open={isFilterOpen}
                                        onClose={() => onToggleFilter(false)}
                                    >
                                        <DrawerHeader>
                                            <DrawerTitle>Фильтр</DrawerTitle>
                                        </DrawerHeader>
                                        {/* </Theme> */}
                                        <DrawerContent>
                                            {/* <SearchFeature /> */}
                                            <SearchForm />
                                        </DrawerContent>
                                    </Drawer>
                                ) : (
                                    <div className={styles.searchContainer}>
                                        {/* {!isReservationSlug && <SearchFeature />} */}
                                        {!isReservationSlug && <SearchForm />}
                                    </div>
                                )}{' '}
                            </div>
                            {!isReservationSlug && (
                                <Card>
                                    <CardContent className="p-2">
                                        <Today currentDate={currentDate} />
                                        {isMobile && (
                                            <div>
                                                <Button onClick={() => onToggleFilter(true)}>
                                                    <FilterIcon />
                                                </Button>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                        <div className={styles.childrenContainer}>{children}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
