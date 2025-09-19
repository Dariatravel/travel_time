'use client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Navbar, NavbarNavItem } from '@/features/NavBar';
import { SearchFeature } from '@/features/Search/ui/Search';
import { Today } from '@/features/Today/Today';
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
    { href: routes[PagesEnum.HOTELS], label: 'Отели', icon: Calendar },
    { href: routes[PagesEnum.RESERVATION], label: 'Бронирование', icon: FileTextIcon },
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
                {/* <Col
                    xs={{ flex: 'auto', order: 2 }}
                    sm={{ flex: 'auto', order: 2 }}
                    xl={{ flex: '80px', order: 0 }}
                    className={styles.menuContainer}
                >
                    <TravelMenu />

                </Col> */}
                <div className={styles.contentContainer}>
                    <div className={styles.content} style={{ backgroundColor: 'transparent' }}>
                        {/* <Flex gap={'middle'} className={styles.widgetContainer}> */}
                        <div className="grid grid-cols-[1fr_300px] gap-1">
                            {isMobile ? (
                                <Drawer open={isFilterOpen} onClose={() => onToggleFilter(false)}>
                                    <DrawerHeader>
                                        {' '}
                                        <DrawerTitle>Фильтр</DrawerTitle>
                                    </DrawerHeader>
                                    {/* </Theme> */}
                                    <DrawerContent>
                                        <SearchFeature />
                                    </DrawerContent>
                                </Drawer>
                            ) : (
                                <div className={styles.searchContainer}>
                                    {!isReservationSlug && <SearchFeature />}
                                </div>
                            )}
                            {!isReservationSlug && (
                                <Card>
                                    <CardContent>
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
                        {/* </Flex> */}
                        <div className={styles.childrenContainer}>{children}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
