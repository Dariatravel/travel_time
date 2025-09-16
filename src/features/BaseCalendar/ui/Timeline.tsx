import { Button } from '@/components/ui/button';
import { Interval } from '@/features/Calendar/ui/Intervals';
import { HotelDTO } from '@/shared/api/hotel/hotel';
import { ReserveDTO } from '@/shared/api/reserve/reserve';
import { ZOOM_UNITS, ZoomUnit } from '@/shared/lib/const';
import { $isMobile } from '@/shared/models/mobile';
import { useUnit } from 'effector-react/compat';
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
import React, { useRef, useState } from 'react';
import { CiSquarePlus, CiZoomIn, CiZoomOut } from 'react-icons/ci';
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
    onCreateRoom,
    calendarItemClassName,
    timelineId,
    onGroupsReorder,
}: TimelineProps) => {
    const [isMobile] = useUnit([$isMobile]);
    const timelineRef = useRef<TimelineComponent>(null);
    const [currentUnit, setCurrentUnit] = useState<ZoomUnit>('day');

    const defaultSidebarWidth = sidebarWidth ?? (isMobile ? 100 : 230);

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
            >
                <div className={styles.groupContent}>{group.title}</div>
            </DraggableGroup>
        );
    };

    const getDefaultTime = () => {
        let defaultTimeStart = moment().add(-15, 'day');
        let defaultTimeEnd = moment().add(15, 'day');

        if (isMobile) {
            defaultTimeStart = moment().add(-3, 'day');
            defaultTimeEnd = moment().add(3, 'day');
        }

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

    return (
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
                            return (
                                <div {...getRootProps()} className={styles.calendarHeader}>
                                    {onCreateRoom && (
                                        <Button variant="link" onClick={onCreateRoom}>
                                            <CiSquarePlus size={24} />
                                        </Button>
                                    )}
                                    <Button variant="link" onClick={() => onZoomIn(currentUnit)}>
                                        <CiZoomIn size={24} />
                                    </Button>
                                    <Button variant="link" onClick={() => onZoomOut(currentUnit)}>
                                        <CiZoomOut size={24} />
                                    </Button>
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
                                    {intervals.map((interval) => {
                                        const dateText = isYear
                                            ? moment(interval.startTime.toDate()).format('YYYY')
                                            : moment(interval.startTime.toDate()).format('MMM');

                                        return (
                                            <Interval
                                                interval={interval}
                                                unit={unit}
                                                getIntervalProps={getIntervalProps}
                                                getRootProps={getRootProps}
                                                dateText={dateText}
                                                showPeriod={showPeriod}
                                                intervalStyles={{
                                                    backgroundColor: 'var(--color-bg-success)',
                                                    color: 'var(--color-control-typo-primary)',
                                                }}
                                                key={nanoid()}
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
                                                ? moment(interval.startTime.toDate()).format('MMM')
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
    );
};
