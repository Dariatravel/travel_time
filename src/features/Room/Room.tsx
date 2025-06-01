'use client'
import { RoomDTO } from '@/shared/api/room/room'
import { useScreenSize } from '@/shared/lib/useScreenSize'
import { HotelImage } from '@/shared/ui/Hotel/HotelImage/HotelImage'
import { HotelTitle } from '@/shared/ui/Hotel/HotelTitle'
import { IconEdit } from '@consta/icons/IconEdit'
import { Card } from '@consta/uikit/Card'
import { Text } from '@consta/uikit/Text'
import { Button, Flex } from 'antd'
import cn from 'classnames'
import React from 'react'
import hotelImage from './room.svg'
import styles from './style.module.scss'

export interface HotelProps {
  children?: React.ReactNode
  className?: string
  room: RoomDTO
  onEdit: (room: RoomDTO) => void
}

export const Room = ({ className, room, onEdit }: HotelProps) => {
  const { title, quantity, price, comment } = room
  const { isMobile } = useScreenSize()

  const getTextSize = (isMobile: boolean) => {
    if (isMobile) {
      return 's'
    }
    return 'm'
  }
  return (
    <Card className={cn(styles.container, className)} shadow title={title}>
      <Flex gap={'large'}>
        <HotelImage src={hotelImage.src} />
        <div className={styles.infoContainer}>
          <Flex
            vertical
            justify="flex-start"
            className={styles.verticalContainer}
          >
            <div>
              <Flex align={'center'} justify={'space-between'}>
                <HotelTitle>{title}</HotelTitle>
                <Button
                  icon={<IconEdit />}
                  color={'primary'}
                  type={'text'}
                  onClick={() => onEdit(room)}
                />
              </Flex>

              <div className={styles.info}>
                <Text size={getTextSize(isMobile)}>
                  Вместимость: {quantity}
                </Text>
                <Text size={getTextSize(isMobile)}>
                  Стоимость: {price}/сутки
                </Text>
                <Text size={getTextSize(isMobile)}>Заметки: {comment}</Text>
              </div>
            </div>
          </Flex>
        </div>
      </Flex>
    </Card>
  )
}
