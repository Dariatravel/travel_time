import { Button } from '@/components/ui/button';
import { Interval } from '@/features/Calendar/ui/Intervals';
import { cn } from '@/lib/utils';
import { HotelDTO } from '@/shared/api/hotel/hotel';
import { ReserveDTO } from '@/shared/api/reserve/reserve';
import { ZOOM_UNITS, ZoomUnit } from '@/shared/lib/const';
import { $isMobile } from '@/shared/models/mobile';
import { useUnit } from 'effector-react/compat';
import { Plus, ZoomIn, ZoomOut } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/ru';
import {
    CustomHeader,
    Id,
    SidebarHeader,
    Timeline as TimelineComponent,
    TimelineHeaders,
} from 'my-react-calendar-timeline';
import { nanoid } from 'nanoid';
import React, { useEffect, useRef, useState } from 'react';
import { DndTimelineWrapper } from './DndTimelineWrapper';
import { DraggableGroup } from './DraggableGroup';
import styles from './style.module.scss';

const keys = {
    groupIdKey: 'id',
    groupTitleKey: 'title',
    groupRightTitleKey: 'rightTitle',
    itemIdKey: 'id',
    itemTitleKey: 'title',
    itemDivTitleKey: 'title',
    itemGroupKey: 'group',
    itemTimeStartKey: 'start',
    itemTimeEndKey: 'end',
    groupLabelKey: 'title',
};

const DAY = 24 * 60 * 60 * 1000;
const WEEK = DAY * 7;
const THREE_MONTHS = DAY * 30 * 24;

export interface TimelineProps {
    hotel: HotelDTO;
    hotelRooms: any[];
    hotelReserves: any[];
    timelineClassName?: string;
    sidebarWidth?: number;
    onReserveAdd: (groupId: Id, time: number, e: React.SyntheticEvent) => void;
    onItemClick: (reserve: ReserveDTO, hotel: HotelDTO) => void;
    onGroupClick?: (room: any) => void;
    onCreateRoom?: () => void;
    calendarItemClassName?: string;
    timelineId: string;
    onGroupsReorder?: (newOrder: string[]) => void;
}

export const Timeline = ({
    hotel,
    hotelRooms,
    hotelReserves,
    timelineClassName = 'hotelTimeline',
    sidebarWidth,
    onReserveAdd,
    onItemClick,
    onGroupClick,
    onCreateRoom,
    calendarItemClassName,
    timelineId,
    onGroupsReorder,
}: TimelineProps) => {
    const [isMobile] = useUnit([$isMobile]);
    const timelineRef = useRef<TimelineComponent>(null);
    const touchWrapperRef = useRef<HTMLDivElement | null>(null);
    const [currentUnit, setCurrentUnit] = useState<ZoomUnit>(isMobile ? 'month' : 'day');

    const defaultSidebarWidth = sidebarWidth ?? (isMobile ? 40 : 225);
    const monthColors = ['var(--primary)', '#329a77', '#38e0a8'];
    // @ts-nocheck
    const itemRenderer = ({
        item,
        itemContext,
        getItemProps,
        getResizeProps,
    }: {
        item: any;
        itemContext: any;
        getItemProps: (item: any) => any;
        getResizeProps: (item: any) => any;
    }) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const { left: leftResizeProps, right: rightResizeProps } = getResizeProps();

        return (
            <div
                {...getItemProps(item.itemProps)}
                key={nanoid()}
                onDoubleClick={() => {
                    onItemClick(item, hotel);
                }}
                onTouchEnd={() => {
                    onItemClick(item, hotel);
                }}
            >
                {itemContext.useResizeHandle ? <div {...leftResizeProps} /> : ''}
                <div
                    className={`${calendarItemClassName || styles.calendarItem} rct-item-content`}
                    style={{ maxHeight: `${itemContext.dimensions.height}` }}
                >
                    {item?.guest} {item?.phone}
                </div>

                {itemContext.useResizeHandle ? <div {...rightResizeProps} /> : ''}
            </div>
        );
    };

    const groupRenderer = ({ group }: { group: any }) => {
        return (
            <DraggableGroup
                id={`${timelineId}-${group.id}`}
                title={group.title}
                className={styles.timelineGroup}
                onClick={() => {
                    if (onGroupClick) {
                        onGroupClick(group);
                    }
                }}
            >
                <div className={styles.groupContent}>{group.title}</div>
            </DraggableGroup>
        );
    };

    const getDefaultTime = () => {
        const mobileStartOffset = isMobile ? -20 : -15;
        const mobileEndOffset = isMobile ? 40 : 15;
        const desktopStartOffset = -15;
        const desktopEndOffset = 15;

        const defaultTimeStart = moment().add(
            isMobile ? mobileStartOffset : desktopStartOffset,
            'day',
        );
        const defaultTimeEnd = moment().add(isMobile ? mobileEndOffset : desktopEndOffset, 'day');

        return { defaultTimeStart, defaultTimeEnd };
    };

    const onZoomIn = (unit: ZoomUnit) => {
        const currentIndex = ZOOM_UNITS.indexOf(unit);
        const isDay = timelineRef.current?.getTimelineUnit() === 'day';

        if (isDay) return;

        if (currentIndex < ZOOM_UNITS.length - 1) {
            setCurrentUnit(ZOOM_UNITS[currentIndex + 1]);
        }
        timelineRef.current?.changeZoom(-1, 0.5);
    };

    const onZoomOut = (unit: ZoomUnit) => {
        const currentIndex = ZOOM_UNITS.indexOf(unit);
        const isYear = timelineRef.current?.getTimelineUnit() === 'year';

        if (isYear) return;

        timelineRef.current?.changeZoom(1.5, 2);
        if (currentIndex > 0) {
            setCurrentUnit(ZOOM_UNITS[currentIndex - 1]);
        }
    };

    const getHeaderUnit = (
        currentUnit: ZoomUnit,
        isFirstHeader: boolean,
    ): 'day' | 'month' | 'year' => {
        const currentIndex = ZOOM_UNITS.indexOf(currentUnit);

        if (isFirstHeader) {
            // Для первого заголовка берем следующий уровень
            return currentIndex < ZOOM_UNITS.length - 1
                ? ZOOM_UNITS[currentIndex + 1]
                : ZOOM_UNITS[currentIndex];
        } else {
            // Для второго заголовка используем текущий уровень
            return currentUnit;
        }
    };

    const { defaultTimeStart, defaultTimeEnd } = getDefaultTime();

    const groupsForDnd = hotelRooms.map((room) => ({
        id: `${timelineId}-${room.id}`,
        title: room.title,
    }));

    const handleGroupsReorder = (newOrder: string[]) => {
        // Убираем префикс timelineId из ID групп
        const roomIds = newOrder.map((id) => id.replace(`${timelineId}-`, ''));
        onGroupsReorder?.(roomIds);
    };

    useEffect(() => {
        if (!isMobile) return;
        const wrapper = touchWrapperRef.current;
        if (!wrapper) return;
        const scrollContainer = wrapper.querySelector('.rct-outer') as HTMLDivElement | null;
        if (!scrollContainer) return;

        let startX = 0;
        let startY = 0;
        let detectedDirection: 'horizontal' | 'vertical' | null = null;

        const resetLock = () => {
            detectedDirection = null;
            scrollContainer.style.touchAction = '';
            scrollContainer.style.overflowY = '';
        };

        const handleTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1) return;
            startX = event.touches[0].clientX;
            startY = event.touches[0].clientY;
            resetLock();
        };

        const handleTouchMove = (event: TouchEvent) => {
            if (event.touches.length !== 1 || detectedDirection) return;
            const currentTouch = event.touches[0];
            const deltaX = Math.abs(currentTouch.clientX - startX);
            const deltaY = Math.abs(currentTouch.clientY - startY);

            if (deltaX < 8 && deltaY < 8) return;

            if (deltaX > deltaY) {
                detectedDirection = 'horizontal';
                scrollContainer.style.touchAction = 'pan-x';
                scrollContainer.style.overflowY = 'hidden';
            } else {
                detectedDirection = 'vertical';
            }
        };

        scrollContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
        scrollContainer.addEventListener('touchmove', handleTouchMove, { passive: true });
        scrollContainer.addEventListener('touchend', resetLock);
        scrollContainer.addEventListener('touchcancel', resetLock);

        return () => {
            scrollContainer.removeEventListener('touchstart', handleTouchStart);
            scrollContainer.removeEventListener('touchmove', handleTouchMove);
            scrollContainer.removeEventListener('touchend', resetLock);
            scrollContainer.removeEventListener('touchcancel', resetLock);
        };
    }, [isMobile, hotelRooms.length, timelineId]);

    return (
        <div ref={touchWrapperRef}>
            <DndTimelineWrapper
                groups={groupsForDnd}
                onGroupsReorder={handleGroupsReorder}
                timelineId={timelineId}
            >
                <TimelineComponent
                    ref={timelineRef}
                    onZoom={(context, unit) => setCurrentUnit(unit as ZoomUnit)}
                    className={timelineClassName}
                    groups={hotelRooms}
                    items={hotelReserves}
                    keys={keys}
                    sidebarWidth={defaultSidebarWidth}
                    canMove
                    canResize="both"
                    canSelect
                    itemTouchSendsClick={true}
                    stackItems={false}
                    itemHeightRatio={0.75}
                    defaultTimeStart={defaultTimeStart as unknown as number}
                    defaultTimeEnd={defaultTimeEnd as unknown as number}
                    minZoom={WEEK}
                    maxZoom={THREE_MONTHS}
                    onCanvasClick={(groupId, time, e) => {
                        // @typescript-eslint/ban-ts-comment
                        // @ts-expect-error - Событие touch не определено в типах Timeline
                        if (e?.nativeEvent?.pointerType === 'touch') {
                            onReserveAdd(groupId, time, e);
                        }
                    }}
                    onCanvasDoubleClick={onReserveAdd}
                    itemRenderer={itemRenderer}
                    groupRenderer={groupRenderer}
                >
                    <TimelineHeaders className={styles.calendarHeader}>
                        <SidebarHeader>
                            {({ getRootProps }) => {
                                const IconSize = isMobile ? 8 : 24;
                                return (
                                    <div
                                        {...getRootProps()}
                                        className={cn(
                                            styles.calendarTitle,
                                            'pl-2 flex gap-1 flex-col items-start bg-transparent!',
                                        )}
                                    >
                                        <div className="flex gap-1 items-center">
                                            {onCreateRoom && (
                                                <Button
                                                    className={'!p-1'}
                                                    variant="link"
                                                    onClick={onCreateRoom}
                                                >
                                                    <Plus size={IconSize} />
                                                </Button>
                                            )}
                                            <Button
                                                className={'!p-1'}
                                                variant="link"
                                                onClick={() => onZoomIn(currentUnit)}
                                            >
                                                <ZoomIn size={IconSize} />
                                            </Button>
                                            <Button
                                                className={'!p-1'}
                                                variant="link"
                                                onClick={() => onZoomOut(currentUnit)}
                                            >
                                                <ZoomOut size={IconSize} />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            }}
                        </SidebarHeader>
                        <CustomHeader unit={getHeaderUnit(currentUnit, true)}>
                            {({
                                headerContext: { intervals, unit },
                                getRootProps,
                                getIntervalProps,
                                showPeriod,
                            }) => {
                                const isYear = unit === 'year';
                                return (
                                    <div {...getRootProps()}>
                                        {intervals.map((interval, i) => {
                                            // Используем дату интервала для стабильного цвета
                                            const intervalDate = moment(
                                                interval.startTime.toDate(),
                                            );
                                            let colorIndex;

                                            if (isYear) {
                                                // Для годов используем год
                                                colorIndex = intervalDate.year() % 3;
                                            } else {
                                                // Для месяцев используем месяц
                                                colorIndex = intervalDate.month() % 3;
                                            }

                                            const backgroundColor = monthColors[colorIndex];
                                            const dateText = isYear
                                                ? moment(interval.startTime.toDate()).format('YYYY')
                                                : moment(interval.startTime.toDate()).format('MMM');

                                            return (
                                                <Interval
                                                    key={`${unit}-${interval.startTime.format('YYYY-MM-DD')}`}
                                                    interval={interval}
                                                    unit={unit}
                                                    getIntervalProps={getIntervalProps}
                                                    getRootProps={getRootProps}
                                                    dateText={dateText}
                                                    showPeriod={showPeriod}
                                                    intervalStyles={{
                                                        backgroundColor: backgroundColor,
                                                        color: '#fff',
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                );
                            }}
                        </CustomHeader>
                        <CustomHeader unit={getHeaderUnit(currentUnit, false)}>
                            {({
                                headerContext: { intervals, unit },
                                getRootProps,
                                getIntervalProps,
                                showPeriod,
                            }) => {
                                return (
                                    <div {...getRootProps()}>
                                        {intervals.map((interval) => {
                                            const isMonth = unit === 'month';
                                            const isYear = unit === 'year';

                                            const dateText =
                                                isMonth || isYear
                                                    ? moment(interval.startTime.toDate()).format(
                                                          'MMM',
                                                      )
                                                    : interval.startTime.format('DD');

                                            return (
                                                <Interval
                                                    interval={interval}
                                                    unit={unit}
                                                    getIntervalProps={getIntervalProps}
                                                    getRootProps={getRootProps}
                                                    dateText={dateText}
                                                    showPeriod={showPeriod}
                                                    key={nanoid()}
                                                />
                                            );
                                        })}
                                    </div>
                                );
                            }}
                        </CustomHeader>
                    </TimelineHeaders>
                </TimelineComponent>
            </DndTimelineWrapper>
        </div>
    );
};
