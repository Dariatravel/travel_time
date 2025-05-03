'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Text } from '@consta/uikit/Text'
import { nanoid } from 'nanoid'
import { Card } from '@consta/uikit/Card'
import Image from 'next/image'
import { useGetAllCounts } from '@/shared/api/hotel/hotel'
import building from '../../../public/main/building.svg'
import bed from '../../../public/main/bed.svg'
import key from '../../../public/main/key.svg'
import { Button } from '@consta/uikit/Button'
import { ToastContainer } from 'react-toastify'
import cx from './page.module.css'
import { Reserve, useCreateReserve } from '@/shared/api/reserve/reserve'
import { showToast } from '@/shared/ui/Toast/Toast'
import { FullWidthLoader } from '@/shared/ui/Loader/Loader'
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery'
import { Flex } from 'antd'
import { RoomModal } from '@/features/RoomInfo/ui/RoomModal'
import { ReserveModal } from '@/features/ReserveInfo/ui/ReserveModal'
import { HotelModal } from '@/features/HotelModal/ui/HotelModal'
import { useGetSession } from '@/shared/api/auth/auth'

export default function Main() {
  const [isHotelOpen, setIsHotelOpen] = useState<boolean>(false)
  const [isRoomOpen, setIsRoomOpen] = useState<boolean>(false)
  const [isReserveOpen, setIsReserveOpen] = useState<boolean>(false)
  const { data: countsData, isFetching: isCountsLoading } = useGetAllCounts()
  const { data: sessionData } = useGetSession()

  useEffect(() => {
    if (sessionData?.session?.access_token) {
      console.log('Access token:', sessionData.session)
    }
  }, [sessionData])

  const {
    isPending: isReserveLoading,
    mutate: createReserve,
    error: reserveError,
  } = useCreateReserve(
    () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotels })
      setIsReserveOpen(false)
      showToast('Бронь успешно добавлена')
    },
    e => {
      showToast(`Ошибка при добавлении брони ${e}`, 'error')
    }
  )

  const cards = useMemo(
    () => [
      {
        id: nanoid(),
        title: `Отелей всего в базе`,
        btn: { onClick: () => setIsHotelOpen(true), title: 'Добавить отель' },
        count: countsData?.[0]?.hotel_count ?? 0,
        image: <Image src={building.src} alt={''} width={115} height={140} />,
      },
      {
        id: nanoid(),
        title: 'Номеров всего в базе',
        btn: { onClick: () => setIsRoomOpen(true), title: 'Добавить номер' },
        count: countsData?.[0]?.room_count ?? 0,
        image: <Image src={bed.src} alt={''} width={115} height={140} />,
      },
      {
        id: nanoid(),
        title: 'Броней всего в базе',
        btn: { onClick: () => setIsReserveOpen(true), title: 'Добавить бронь' },
        count: countsData?.[0]?.reserve_count ?? 0,
        image: <Image src={key.src} alt={''} width={115} height={140} />,
      },
    ],
    [countsData, isCountsLoading]
  )

  const onReserveCreate = useCallback((reserve: Reserve) => {
    console.log('создаю Reserve')
    createReserve(reserve)
  }, [])

  if (isCountsLoading) return <FullWidthLoader />
  return (
    <div>
      <HotelModal
        isOpen={isHotelOpen}
        onClose={() => setIsHotelOpen(false)}
        currentReserve={null}
      />
      <RoomModal
        isOpen={isRoomOpen}
        onClose={() => setIsRoomOpen(false)}
        currentReserve={null}
      />
      <ReserveModal
        isOpen={isReserveOpen}
        onClose={() => setIsReserveOpen(false)}
        onAccept={onReserveCreate}
        currentReserve={null}
        isLoading={isReserveLoading}
      />

      <Text
        size="2xl"
        weight={'semibold'}
        view={'success'}
        style={{ marginBottom: '2.25rem' }}
      >
        Все отели
      </Text>
      <Flex gap={'middle'} style={{ maxWidth: '1280px' }} wrap>
        {cards.map(({ count, btn, image, title, id }) => {
          return (
            <Card key={id} shadow title={title} className={cx.card}>
              <div className={cx.image}>{image}</div>
              <div className={cx.count}>
                <Text view={'success'} size={'5xl'} weight={'semibold'}>
                  {count}
                </Text>
              </div>
              <div className={cx.container}>
                <div className={cx.info}>
                  <Text view={'primary'} size={'xl'}>
                    {title}
                  </Text>
                  <Button
                    className={cx.button}
                    label={btn.title}
                    onClick={btn.onClick}
                    view={'secondary'}
                  />
                </div>
              </div>
            </Card>
          )
        })}
      </Flex>
      <ToastContainer />
    </div>
  )
}
