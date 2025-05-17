'use client'
import React from 'react'
import styles from './style.module.css'
import cn from 'classnames'
import { Text } from '@consta/uikit/Text'

export interface HotelTitleProps {
  children?: React.ReactNode
  className?: string
  onClick?: () => void
  size?:
    | 's'
    | 'm'
    | 'xl'
    | '2xs'
    | 'xs'
    | 'l'
    | '2xl'
    | '3xl'
    | '4xl'
    | '5xl'
    | '6xl'
    | undefined
}

export const HotelTitle = ({
  className,
  onClick,
  children,
  size = 'xl',
}: HotelTitleProps) => {
  return (
    <div className={cn(styles.container, className)} onClick={onClick}>
      <Text
        className={styles.title}
        transform={'uppercase'}
        weight={'semibold'}
        size={size}
      >
        {children}
      </Text>
    </div>
  )
}
