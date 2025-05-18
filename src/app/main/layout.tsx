'use client';
import { SearchFeature } from '@/features/Search/ui/Search';
import { Today } from '@/features/Today/Today';
import { useAuth } from '@/shared/lib/useAuth';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { setIsMobile } from '@/shared/models/mobile';
import { TravelMenu } from '@/shared/ui/Menu/Menu';
import { LayoutExampleBig } from '@/ui/Header/Header';
import { Col, Flex, Layout, Row } from 'antd';
import { useUnit } from 'effector-react/compat';
import moment from 'moment/moment';
import { usePathname } from 'next/navigation';
import React, { useLayoutEffect } from 'react';
import styles from './layout.module.scss';

export interface LayoutProps {
    children?: React.ReactNode;
    className?: string;
}

moment.locale('ru');

export default function MainLayout({ children }: LayoutProps) {
    useAuth();
    const currentDate = moment().locale('ru').format('dddd, D MMMM YYYY');

    const isReservationSlug = usePathname().includes('reservation/');
    console.log(isReservationSlug);

    const [onSetIsMobile] = useUnit([setIsMobile]);
    const { isMobile } = useScreenSize();

    useLayoutEffect(() => {
        onSetIsMobile(isMobile);
    }, [isMobile]);

    return (
        <Layout>
            <LayoutExampleBig />
            <Row style={{ backgroundColor: '#FFF' }} gutter={[16, 16]} wrap={false}>
                <Col xs={{ flex: 'auto', order: 2 }} sm={{ flex: 'auto', order: 2 }} xl={{ flex: '80px', order: 0 }} className={styles.menuContainer}>
                    <TravelMenu />
                </Col>
                <Col flex="auto" className={styles.contentContainer}>
                    <Layout className={styles.content} style={{ backgroundColor: 'transparent' }}>
                        <Flex gap={'middle'} wrap className={styles.widgetContainer}>
                            <div className={styles.searchContainer}>{!isReservationSlug && <SearchFeature />}</div>
                            {!isReservationSlug && (
                                <Flex vertical>
                                    <Today
                                        currentDate={currentDate}
                                        // open={isCalendarOpen}
                                        // onToggle={() =>
                                        //   setIsCalendarOpen((prev) => !prev)
                                        // }
                                    />
                                </Flex>
                            )}
                        </Flex>
                        <div className={styles.childrenContainer}>{children}</div>
                    </Layout>
                </Col>
            </Row>
        </Layout>
    );
}
