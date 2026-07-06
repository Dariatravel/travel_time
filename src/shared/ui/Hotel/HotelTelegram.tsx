'use client'
import Image from 'next/image'
import React from 'react'
import styles from './style.module.css'
import cn from 'classnames'
import { LinkIcon } from '@/shared/ui/LinkIcon/LinkIcon'

export interface HotelTelegramProps {
  url: string
  className?: string
}

export const HotelTelegram = ({ className, url }: HotelTelegramProps) => {
  return (
    <div className={cn(styles.container, className)}>
      <LinkIcon
        icon={<Image src="/icon.png" alt="Сайт" width={24} height={24} className="rounded-sm" />}
        link={url}
      />
    </div>
  )
}
