'use client'
import cx from '@/features/Calendar/ui/style.module.scss'
import { devLog } from '@/shared/lib/logger'
import { Dayjs } from 'dayjs'
import { IntervalContext } from 'my-react-calendar-timeline'
import { nanoid } from 'nanoid'
import React, { CSSProperties, HTMLAttributes, HTMLProps } from 'react'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { GetIntervalPropsParams } from 'my-react-calendar-timeline/dist/lib/headers/types'
import cn from 'classnames'

export interface IntervalProps {
  children?: React.ReactNode
  className?: string
  interval: IntervalContext['interval']
  unit: string
  showPeriod: (start: Dayjs, end: Dayjs) => void
  getIntervalProps: (
    props?: GetIntervalPropsParams
  ) => HTMLAttributes<HTMLDivElement> & {
    key: string
  }
  getRootProps: (props?: {
    style?: React.CSSProperties
  }) => HTMLProps<HTMLDivElement>
  dateText: string
  intervalStyles?: CSSProperties
}

export const Interval = ({
  interval,
  unit,
  showPeriod,
  getIntervalProps,
  getRootProps,
  dateText,
  intervalStyles,
  className,
}: IntervalProps) => {
  return (
    <div
      onClick={() => {
        showPeriod(interval.startTime, interval.endTime)
        devLog('Interval', {
          interval,
          unit,
          root: getRootProps(),
        })
      }}
      className={cn(cx.interval, className)}
      {...getIntervalProps({
        interval,
        style: intervalStyles ?? undefined,
      })}
      key={nanoid()}
    >
      <div
        className="sticky"
        style={{
          position: 'sticky',
          // left: '10px',
          paddingLeft: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        {dateText}
      </div>
    </div>
  )
}
