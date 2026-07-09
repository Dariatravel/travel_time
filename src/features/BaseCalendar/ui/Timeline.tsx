import { Button } from '@/components/ui/button';
import {
    TIMELINE_ITEM_HEIGHT_RATIO,
    TIMELINE_ROW_HEIGHT,
} from '@/features/BaseCalendar/lib/timelineLayout';
import { Interval } from '@/features/Calendar/ui/Intervals';
import { cn } from '@/lib/utils';
import { HotelDTO } from '@/shared/api/hotel/hotel';
import { ReserveDTO } from '@/shared/api/reserve/reserve';
import { ZOOM_UNITS, ZoomUnit } from '@/shared/lib/const';
import {
    isTrialHotelTitle,
    isTrialReserveFixed,
} from '@/features/BaseCalendar/lib/trialBookingLayout';
import {
    getTimelineItemLabel,
    isTimelineClosureItem,
    normalizeTimelineVisualItem,
} from '@/features/BaseCalendar/lib/timelineBlocks';
import { useScreenSize } from '@/shared/lib/useScreenSize';
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    /** Период поиска: начало и конец в unix (секунды). Если заданы — календарь покажет этот интервал вместо текущей даты. */
    visibleTimeStart?: number;
    visibleTimeEnd?: number;
    timelineClassName?: string;
    sidebarWidth?: number;
    canvasAction?: 'booking' | 'closure';
    onReserveAdd: (groupId: Id, time: number, e: React.SyntheticEvent) => void;
    onClosureAdd?: (groupId: Id, time: number, e: React.SyntheticEvent) => void;
    onItemClick: (reserve: ReserveDTO, hotel: HotelDTO) => void;
    onClosureItemClick?: (item: any) => void;
    onGroupClick?: (room: any) => void;
    onCreateRoom?: () => void;
    calendarItemClassName?: string;
    timelineId: string;
    onGroupsReorder?: (newOrder: string[]) => void;
    onItemMove?: (itemId: Id, dragTime: number, newGroupOrder: number) => void;
}

export const Timeline = ({
    hotel,
    hotelRooms,
    hotelReserves,
    visibleTimeStart,
    visibleTimeEnd,
    timelineClassName = 'hotelTimeline',
    sidebarWidth,
    onReserveAdd,
    onClosureAdd,
    onItemClick,
    onClosureItemClick,
    onGroupClick,
    onCreateRoom,
    calendarItemClassName,
    timelineId,
    onGroupsReorder,
    onItemMove,
    canvasAction = 'booking',
}: TimelineProps) => {
    // const [isMobile] = useUnit([$isMobile]);
    const { isMobile, isPhone } = useScreenSize();
    const timelineRef = useRef<TimelineComponent>(null);
    const touchWrapperRef = useRef<HTMLDivElement | null>(null);
    const touchStartRef = useRef({ x: 0, y: 0 });
    const hasTouchMovedRef = useRef(false);
    const [currentUnit, setCurrentUnit] = useState<ZoomUnit>(isPhone ? 'day' : isMobile ? 'month' : 'day');
    const [mobileVisibleRange, setMobileVisibleRange] = useState<{ start: number; end: number } | null>(null);
    const initialZoomAppliedRef = useRef(false);

    // Функция для определения уровня зума на основе unit и видимого периода
    // Возвращает: 'day' (Дни), 'month' (Месяц), 'months' (Месяцы), 'year' (Год)
    const getZoomLevel = (
        unit: string,
        visibleTimeStart: number,
        visibleTimeEnd: number,
    ): ZoomUnit => {
        const visibleDays = (visibleTimeEnd - visibleTimeStart) / DAY;

        if (unit === 'day') {
            return 'day'; // Дни
        } else if (unit === 'month') {
            // Если видно примерно 1 месяц (25-40 дней) -> Месяц
            // Если видно больше месяца (40+ дней) -> Месяцы
            if (visibleDays >= 25 && visibleDays <= 40) {
                return 'month'; // Месяц (один месяц)
            } else if (visibleDays > 40) {
                return 'months'; // Месяцы (несколько месяцев)
            } else {
                return 'month'; // По умолчанию Месяц
            }
        } else if (unit === 'year') {
            return 'year'; // Год
        }

        return 'day'; // По умолчанию
    };

    const defaultSidebarWidth = sidebarWidth ?? (isPhone ? 78 : isMobile ? 92 : 225);
    const rowHeight = isPhone
        ? TIMELINE_ROW_HEIGHT.phone
        : isMobile
          ? TIMELINE_ROW_HEIGHT.tablet
          : TIMELINE_ROW_HEIGHT.desktop;
    const monthColors = ['var(--primary)', '#329a77', '#38e0a8'];

    const { defaultTimeStart, defaultTimeEnd } = useMemo(() => {
        // Если задан период поиска — показываем его (с небольшим отступом)
        if (
            visibleTimeStart != null &&
            visibleTimeEnd != null &&
            visibleTimeStart < visibleTimeEnd
        ) {
            const paddingDays = isMobile ? 2 : 7;
            const defaultTimeStart = moment.unix(visibleTimeStart).add(-paddingDays, 'day');
            const defaultTimeEnd = moment.unix(visibleTimeEnd).add(paddingDays, 'day');
            return { defaultTimeStart, defaultTimeEnd };
        }

        // Иначе — период вокруг текущей даты
        const mobileStartOffset = -6;
        const mobileEndOffset = 6;
        const desktopStartOffset = -45; // ~1.5 месяца назад
        const desktopEndOffset = 45; // ~1.5 месяца вперед

        const defaultTimeStart = moment().add(
            isMobile ? mobileStartOffset : desktopStartOffset,
            'day',
        );
        const defaultTimeEnd = moment().add(
            isMobile ? mobileEndOffset : desktopEndOffset,
            'day',
        );

        return { defaultTimeStart, defaultTimeEnd };
    }, [visibleTimeStart, visibleTimeEnd, isMobile]);
    const defaultRange = useMemo(
        () => ({
            start: defaultTimeStart.valueOf(),
            end: defaultTimeEnd.valueOf(),
        }),
        [defaultTimeStart, defaultTimeEnd],
    );

    const handleCanvasAction = useCallback(
        (groupId: Id, time: number, e: React.SyntheticEvent) => {
            if (canvasAction === 'closure') {
                onClosureAdd?.(groupId, time, e);
                return;
            }

            onReserveAdd(groupId, time, e);
        },
        [canvasAction, onClosureAdd, onReserveAdd],
    );

    const itemRenderer = useCallback(
        ({
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
            const isClosure = isTimelineClosureItem(item);
            const reserveClassName =
                !isClosure && item.trialReserveVariant === 'fixed'
                    ? styles.fixedReserveItem
                    : !isClosure && item.trialReserveVariant === 'movable'
                      ? styles.movableReserveItem
                      : calendarItemClassName || styles.calendarItem;

            const handleItemOpen = () => {
                if (isClosure) {
                    onClosureItemClick?.(item);
                    return;
                }

                onItemClick(item, hotel);
            };

            return (
                <div
                    {...getItemProps({
                        ...item.itemProps,
                        style: {
                            ...item.itemProps?.style,
                            ...(isClosure
                                ? {
                                      background: 'transparent',
                                      border: 'none',
                                      boxShadow: 'none',
                                  }
                                : {}),
                        },
                    })}
                    onClick={() => {
                        if (isClosure) {
                            handleItemOpen();
                        }
                    }}
                    onDoubleClick={handleItemOpen}
                    onTouchStart={(event) => {
                        const touch = event.touches[0];
                        if (!touch) return;
                        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
                        hasTouchMovedRef.current = false;
                    }}
                    onTouchMove={(event) => {
                        const touch = event.touches[0];
                        if (!touch) return;
                        const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
                        const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
                        if (deltaX > 10 || deltaY > 10) {
                            hasTouchMovedRef.current = true;
                        }
                    }}
                    onTouchEnd={() => {
                        if (hasTouchMovedRef.current) return;
                        handleItemOpen();
                    }}
                >
                    {itemContext.useResizeHandle ? <div {...leftResizeProps} /> : ''}
                    <div
                        className={`${isClosure ? styles.closureItem : reserveClassName} rct-item-content`}
                        style={{ maxHeight: `${itemContext.dimensions.height}` }}
                    >
                        {getTimelineItemLabel(item)}
                    </div>

                    {itemContext.useResizeHandle ? <div {...rightResizeProps} /> : ''}
                </div>
            );
        },
        [calendarItemClassName, hotel, onClosureItemClick, onItemClick],
    );

    const groupRenderer = useCallback(
        ({ group }: { group: any }) => {
            if (isPhone) {
                return (
                    <div
                        className={styles.mobileGroupLabel}
                        title={group.title}
                        onClick={() => {
                            if (onGroupClick) {
                                onGroupClick(group);
                            }
                        }}
                        style={{ cursor: onGroupClick ? 'pointer' : 'default' }}
                    >
                        {group.title}
                    </div>
                );
            }

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
        },
        [isPhone, onGroupClick, timelineId],
    );

    const handleTimelineZoom = useCallback(
        (
            context: { visibleTimeStart: number; visibleTimeEnd: number },
            unit: string,
        ) => {
            const zoomLevel = getZoomLevel(
                unit,
                context.visibleTimeStart,
                context.visibleTimeEnd,
            );
            setCurrentUnit((prev) => (prev === zoomLevel ? prev : zoomLevel));
        },
        [],
    );

    const onZoomIn = (unit: ZoomUnit) => {
        const currentIndex = ZOOM_UNITS.indexOf(unit);
        const isDay = timelineRef.current?.getTimelineUnit() === 'day';
        const UNIT = timelineRef.current?.getTimelineUnit() ?? 'month';
        if (isDay) return;

        if (currentIndex < ZOOM_UNITS.length - 1) {
            // @ts-expect-error - UNIT может быть типа "week", который не поддерживается setCurrentUnit
            setCurrentUnit(UNIT);
        }
        timelineRef.current?.changeZoom(-2, 0.5);
    };

    const onZoomOut = (unit: ZoomUnit) => {
        const currentIndex = ZOOM_UNITS.indexOf(unit);
        const timelineUnit = timelineRef.current?.getTimelineUnit();
        const isYear = timelineUnit === 'year';
        const UNIT = timelineRef.current?.getTimelineUnit() ?? 'month';

        if (isYear) return;

        timelineRef.current?.changeZoom(2, 2);
        if (currentIndex > 0) {
            // @ts-expect-error - UNIT может быть типа "week", который не поддерживается setCurrentUnit
            setCurrentUnit(UNIT);
        }
    };

    const getHeaderUnit = (
        currentUnit: ZoomUnit,
        isFirstHeader: boolean,
    ): 'day' | 'month' | 'year' => {
        const currentIndex = ZOOM_UNITS.indexOf(currentUnit);
        let unit: ZoomUnit;

        if (isFirstHeader) {
            // Для первого заголовка берем следующий уровень
            unit =
                currentIndex < ZOOM_UNITS.length - 1
                    ? ZOOM_UNITS[currentIndex + 1]
                    : ZOOM_UNITS[currentIndex];
        } else {
            // Для второго заголовка используем текущий уровень
            unit = currentUnit;
        }

        // Преобразуем 'months' в 'month' для совместимости с CustomHeader
        return unit === 'months' ? 'month' : unit;
    };

    const groupsForDnd = useMemo(
        () =>
            hotelRooms.map((room) => ({
                id: `${timelineId}-${room.id}`,
                title: room.title,
            })),
        [hotelRooms, timelineId],
    );

    const handleGroupsReorder = (newOrder: string[]) => {
        // Убираем префикс timelineId из ID групп
        const roomIds = newOrder.map((id) => id.replace(`${timelineId}-`, ''));
        onGroupsReorder?.(roomIds);
    };

    // Устанавливаем дефолтный зум после монтирования компонента
    // Зум определяется разницей между defaultTimeStart и defaultTimeEnd
    // Маленький диапазон = большой зум (дни), большой диапазон = маленький зум (месяцы)
    useEffect(() => {
        initialZoomAppliedRef.current = false;
    }, [visibleTimeStart, visibleTimeEnd]);

    useEffect(() => {
        if (isPhone || !timelineRef.current || initialZoomAppliedRef.current) return;

        const timeoutId = window.setTimeout(() => {
            if (!timelineRef.current || initialZoomAppliedRef.current) return;

            initialZoomAppliedRef.current = true;
            timelineRef.current.changeZoom(isMobile ? 0.5 : 3.5, 0.5);
        }, 300);

        return () => window.clearTimeout(timeoutId);
    }, [isMobile, isPhone, visibleTimeStart, visibleTimeEnd]);

    useEffect(() => {
        if (!isPhone) {
            setMobileVisibleRange(null);
            return;
        }

        setMobileVisibleRange(defaultRange);
    }, [defaultRange, isPhone]);

    const handleWrapperTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        const touch = event.touches[0];
        if (!touch) return;
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        hasTouchMovedRef.current = false;
    };

    const handleWrapperTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
        const touch = event.touches[0];
        if (!touch) return;
        const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
        const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

        if (deltaX > 10 || deltaY > 10) {
            hasTouchMovedRef.current = true;
        }
    };

    const handleWrapperTouchEnd = () => {
        window.setTimeout(() => {
            hasTouchMovedRef.current = false;
        }, 250);
    };

    const formatIntervalDate = (date: Date, unit: string) => {
        const intervalDate = moment(date);

        if (unit === 'day') {
            return intervalDate.format(isPhone ? 'DD dd' : 'DD');
        }

        return intervalDate.format('MMM');
    };

    const formatMonthWithYear = (date: Date) => {
        const intervalDate = moment(date);
        return `${intervalDate.format('MMM')} '${intervalDate.format('YY')}`;
    };

    const shiftMobileTimeline = useCallback(
        (days: number) => {
            const shift = days * DAY;
            setMobileVisibleRange((currentRange) => {
                const range = currentRange ?? defaultRange;
                return {
                    start: range.start + shift,
                    end: range.end + shift,
                };
            });
        },
        [defaultRange],
    );

    const resetMobileTimeline = useCallback(() => {
        setMobileVisibleRange(defaultRange);
    }, [defaultRange]);

    const handleTimeChange = useCallback(
        (
            visibleStart: number,
            visibleEnd: number,
            updateScrollCanvas: (start: number, end: number, forceUpdateDimensions?: boolean) => void,
        ) => {
            if (isPhone) {
                setMobileVisibleRange({ start: visibleStart, end: visibleEnd });
            }
            updateScrollCanvas(visibleStart, visibleEnd);
        },
        [isPhone],
    );

    const capitalizeMonthToken = (formatted: string) => {
        // ru locale returns lowercase month abbreviations (e.g. «июля»); capitalize for scanability
        return formatted.replace(/\b([а-яёa-z]{3,})\b/gi, (word) => {
            return word.charAt(0).toUpperCase() + word.slice(1);
        });
    };

    const mobileRangeLabel = (() => {
        const range = mobileVisibleRange ?? defaultRange;
        const start = moment(range.start);
        const end = moment(range.end);
        let raw: string;
        if (start.isSame(end, 'day')) {
            raw = start.format('D MMM');
        } else if (start.isSame(end, 'month')) {
            raw = `${start.format('D')}–${end.format('D MMM')}`;
        } else if (start.isSame(end, 'year')) {
            raw = `${start.format('D MMM')} – ${end.format('D MMM')}`;
        } else {
            raw = `${start.format('D MMM YYYY')} – ${end.format('D MMM YYYY')}`;
        }
        return capitalizeMonthToken(raw);
    })();
    const mobileResetLabel =
        visibleTimeStart != null && visibleTimeEnd != null ? 'К периоду' : 'Сегодня';

    const upperHeaderUnit = getHeaderUnit(currentUnit, true);
    const lowerHeaderUnit = getHeaderUnit(currentUnit, false);
    /** На телефоне скрываем подписи верхнего ряда только когда оба ряда на одном масштабе (дубль). */
    const hideUpperIntervalTextOnPhone = isPhone && upperHeaderUnit === lowerHeaderUnit;
    const visualHotelReserves = useMemo(() => {
        const isTrialHotel = isTrialHotelTitle(hotel.title);
        const roomById = new Map(hotelRooms.map((room) => [room.id, room]));

        return hotelReserves.map((item) => {
            const visualItem = normalizeTimelineVisualItem(item);

            if (!isTrialHotel || isTimelineClosureItem(item)) {
                return visualItem;
            }

            const room = roomById.get(item.room_id);
            const isFixed = isTrialReserveFixed(item, room);

            return {
                ...visualItem,
                canMove: !isFixed,
                trialReserveVariant: isFixed ? 'fixed' : 'movable',
                itemProps: {
                    ...item.itemProps,
                    style: {
                        ...item.itemProps?.style,
                        background: isFixed ? '#fee2e2' : '#ffffff',
                        border: isFixed ? '1px solid #ef4444' : '1px solid #d1d5db',
                    },
                },
            };
        });
    }, [hotel.title, hotelRooms, hotelReserves]);

    return (
        <div
            ref={touchWrapperRef}
            className={cn(isPhone && styles.mobileTimelineWrapper)}
            onTouchStart={handleWrapperTouchStart}
            onTouchMove={handleWrapperTouchMove}
            onTouchEnd={handleWrapperTouchEnd}
            onTouchCancel={handleWrapperTouchEnd}
        >
            {isPhone && (
                <div className={styles.mobileTimelineControls}>
                    <div className={styles.mobileRangeLabel}>{mobileRangeLabel}</div>
                    <div className={styles.mobileTimelineNav}>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label="Показать предыдущий день"
                            onClick={() => shiftMobileTimeline(-1)}
                        >
                            -1
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label="Показать предыдущую неделю"
                            onClick={() => shiftMobileTimeline(-7)}
                        >
                            -7
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            aria-label="Вернуться к исходному периоду"
                            onClick={resetMobileTimeline}
                        >
                            {mobileResetLabel}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label="Показать следующую неделю"
                            onClick={() => shiftMobileTimeline(7)}
                        >
                            +7
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label="Показать следующий день"
                            onClick={() => shiftMobileTimeline(1)}
                        >
                            +1
                        </Button>
                    </div>
                </div>
            )}
            <DndTimelineWrapper
                groups={groupsForDnd}
                onGroupsReorder={handleGroupsReorder}
                timelineId={timelineId}
                enableTouchSensor={!isPhone}
            >
                <TimelineComponent
                    ref={timelineRef}
                    onZoom={handleTimelineZoom}
                    onTimeChange={handleTimeChange}
                    className={timelineClassName}
                    groups={hotelRooms}
                    items={visualHotelReserves}
                    keys={keys}
                    sidebarWidth={defaultSidebarWidth}
                    canMove={!!onItemMove}
                    canResize={false}
                    dragSnap={DAY}
                    onItemMove={onItemMove}
                    canSelect
                    itemTouchSendsClick={true}
                    stackItems={false}
                    lineHeight={rowHeight}
                    itemHeightRatio={TIMELINE_ITEM_HEIGHT_RATIO}
                    defaultTimeStart={defaultRange.start}
                    defaultTimeEnd={defaultRange.end}
                    visibleTimeStart={isPhone ? (mobileVisibleRange ?? defaultRange).start : undefined}
                    visibleTimeEnd={isPhone ? (mobileVisibleRange ?? defaultRange).end : undefined}
                    minZoom={WEEK}
                    maxZoom={THREE_MONTHS}
                    onCanvasClick={(groupId, time, e) => {
                        // @typescript-eslint/ban-ts-comment
                        // @ts-expect-error - Событие touch не определено в типах Timeline
                        if (e?.nativeEvent?.pointerType === 'touch') {
                            if (hasTouchMovedRef.current) return;
                            handleCanvasAction(groupId, time, e);
                        }
                    }}
                    onCanvasDoubleClick={handleCanvasAction}
                    itemRenderer={itemRenderer}
                    groupRenderer={groupRenderer}
                >
                    <TimelineHeaders className={styles.calendarHeader}>
                        {!isPhone && (
                            <SidebarHeader>
                                {({ getRootProps }) => {
                                    const IconSize = isMobile ? 12 : 24;
                                    const headerButtonClassName = '!p-1';
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
                                                        className={headerButtonClassName}
                                                        variant="link"
                                                        aria-label="Добавить номер"
                                                        onClick={onCreateRoom}
                                                    >
                                                        <Plus size={IconSize} />
                                                    </Button>
                                                )}
                                                <Button
                                                    className={headerButtonClassName}
                                                    variant="link"
                                                    aria-label="Приблизить календарь"
                                                    onClick={() => onZoomIn(currentUnit)}
                                                >
                                                    <ZoomIn size={IconSize} />
                                                </Button>
                                                <Button
                                                    className={headerButtonClassName}
                                                    variant="link"
                                                    aria-label="Отдалить календарь"
                                                    onClick={() => onZoomOut(currentUnit)}
                                                >
                                                    <ZoomOut size={IconSize} />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                }}
                            </SidebarHeader>
                        )}
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
                                            // Используем дату интервала для стабильного цвета
                                            const intervalDate = moment(interval.startTime.toDate());
                                            let colorIndex;

                                            if (isYear) {
                                                colorIndex = intervalDate.year() % 3;
                                            } else {
                                                colorIndex = intervalDate.month() % 3;
                                            }

                                            const backgroundColor = monthColors[colorIndex];
                                            const dateText = hideUpperIntervalTextOnPhone
                                                ? ''
                                                : isYear
                                                  ? intervalDate.format('YYYY')
                                                  : formatMonthWithYear(
                                                        interval.startTime.toDate(),
                                                    );

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

                                            const dateText = isYear
                                                ? moment(interval.startTime.toDate()).format('YYYY')
                                                : isMonth
                                                  ? formatMonthWithYear(
                                                        interval.startTime.toDate(),
                                                    )
                                                  : formatIntervalDate(
                                                        interval.startTime.toDate(),
                                                        unit,
                                                    );

                                            return (
                                                <Interval
                                                    interval={interval}
                                                    unit={unit}
                                                    getIntervalProps={getIntervalProps}
                                                    getRootProps={getRootProps}
                                                    dateText={dateText}
                                                    showPeriod={showPeriod}
                                                    key={`${unit}-${interval.startTime.format('YYYY-MM-DD')}`}
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
