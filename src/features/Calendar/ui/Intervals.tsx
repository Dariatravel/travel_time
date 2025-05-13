'use client';
import React, { CSSProperties, HTMLAttributes, HTMLProps } from 'react';
import cx from '@/features/Calendar/ui/style.module.scss';
import { nanoid } from 'nanoid';
import { IntervalContext } from 'react-calendar-timeline';
import { Dayjs } from 'dayjs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { GetIntervalPropsParams } from 'react-calendar-timeline/dist/lib/headers/types';

export interface IntervalProps {
    children?: React.ReactNode;
    className?: string;
    interval: IntervalContext['interval'];
    unit: string;
    showPeriod: (start: Dayjs, end: Dayjs) => void;
    getIntervalProps: (props?: GetIntervalPropsParams) => HTMLAttributes<HTMLDivElement> & {
        key: string;
    };
    getRootProps: (props?: { style?: React.CSSProperties }) => HTMLProps<HTMLDivElement>;
    dateText: string;
    intervalStyles?: CSSProperties;
}

export const Interval = ({ interval, unit, showPeriod, getIntervalProps, getRootProps, dateText, intervalStyles }: IntervalProps) => {
    return (
        <div
            onClick={() => {
                showPeriod(interval.startTime, interval.endTime);
                console.log({
                    interval,
                    unit,
                    root: getRootProps(),
                });
                // console.log(getIntervalProps({interval}))
            }}
            className={cx.interval}
            {...getIntervalProps({
                interval,
                style: intervalStyles ?? undefined,
            })}
            key={nanoid()}
        >
            <div className="sticky">{dateText}</div>
        </div>
    );
};
