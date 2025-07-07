'use client'
import { SearchFeature } from '@/features/Search/ui/Search'
import { Today } from '@/features/Today/Today'
import { useAuth } from '@/shared/lib/useAuth'
import { useScreenSize } from '@/shared/lib/useScreenSize'
import { setIsMobile } from '@/shared/models/mobile'
import { TravelMenu } from '@/shared/ui/Menu/Menu'
import { LayoutExampleBig } from '@/ui/Header/Header'
import { Badge, Button, Col, Drawer, Flex, Layout, Row } from 'antd'
import { useUnit } from 'effector-react/compat'
import moment from 'moment/moment'
import { usePathname } from 'next/navigation'
import React, { useLayoutEffect, useState } from 'react'
import styles from './layout.module.scss'
import { Theme } from '@consta/uikit/Theme'
import { THEME_PRESET } from '@/shared/config/theme'
import { FilterOutlined } from '@ant-design/icons'
import { isEmptyObject } from '@rc-component/async-validator/es/util'
import { $hotelsFilter } from '@/shared/models/hotels'
import { isFilterEmpty } from '@/features/Search/lib/isFilterEmpty'

export interface LayoutProps {
  children?: React.ReactNode
  className?: string
}

moment.locale('ru')

export default function MainLayout({ children }: LayoutProps) {
  useAuth()
  const currentDate = moment().locale('ru').format('dddd, D MMMM YYYY')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const isReservationSlug = usePathname().includes('reservation/')
  const filter = useUnit($hotelsFilter)
  const [onSetIsMobile] = useUnit([setIsMobile])
  const { isMobile } = useScreenSize()

  const onToggleFilter = (state: boolean) => {
    setIsFilterOpen(state)
  }
  useLayoutEffect(() => {
    onSetIsMobile(isMobile)
  }, [isMobile])

  return (
    <Layout>
      <LayoutExampleBig />
      <Row style={{ backgroundColor: '#FFF' }} gutter={[16, 16]} wrap={false}>
        <Col
          xs={{ flex: 'auto', order: 2 }}
          sm={{ flex: 'auto', order: 2 }}
          xl={{ flex: '80px', order: 0 }}
          className={styles.menuContainer}
        >
          <TravelMenu />
        </Col>
        <Col flex="auto" className={styles.contentContainer}>
          <Layout
            className={styles.content}
            style={{ backgroundColor: 'transparent' }}
          >
            <Flex gap={'middle'} wrap className={styles.widgetContainer}>
              {isMobile ? (
                <Drawer
                  title="Фильтр"
                  placement={'bottom'}
                  open={isFilterOpen}
                  onClose={() => onToggleFilter(false)}
                >
                  <Theme preset={THEME_PRESET}>
                    <SearchFeature onSearchCb={() => onToggleFilter(false)} />
                  </Theme>
                </Drawer>
              ) : (
                <div className={styles.searchContainer}>
                  {!isReservationSlug && <SearchFeature />}
                </div>
              )}
              {!isReservationSlug && (
                <Flex vertical>
                  <Today currentDate={currentDate} />
                  {isMobile && (
                    <div style={{ marginTop: '1rem' }}>
                      <Badge color={'green'} dot={!isFilterEmpty(filter)}>
                        <Button
                          icon={<FilterOutlined />}
                          onClick={() => onToggleFilter(true)}
                        />
                      </Badge>
                    </div>
                  )}
                </Flex>
              )}
            </Flex>
            <div className={styles.childrenContainer}>{children}</div>
          </Layout>
        </Col>
      </Row>
    </Layout>
  )
}
