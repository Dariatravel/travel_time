'use client'
import React from 'react'
import styles from './style.module.css'
import cn from 'classnames'
import Image from 'next/image'
import { Tag } from '@consta/uikit/Tag'

export interface HotelImageProps {
  children?: React.ReactNode
  className?: string
  src: string
  width?: number
  height?: number
  type?: string
  onClick?: () => void
}

export const HotelImage = ({
  type,
  className,
  src,
  height = 157,
  width = 164,
  onClick,
}: HotelImageProps) => {
  return (
    <div className={cn(styles.container, className)} onClick={onClick}>
      {type && (
        <Tag className={styles.tag} label={type} size={'s'} mode={'info'} />
      )}
      <Image
        className={styles.hotelIcon}
        src={src}
        alt={'Изображение отеля'}
        layout={'fill'}
        objectFit={'cover'}
      />
    </div>
  )
}
