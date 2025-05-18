import { Interval } from '@/features/Calendar/ui/Intervals';
import { ReserveModal } from '@/features/ReserveInfo/ui/ReserveModal';
import { RoomModal } from '@/features/RoomInfo/ui/RoomModal';
import { HotelDTO } from '@/shared/api/hotel/hotel';
import { CurrentReserveType, Nullable, Reserve, ReserveDTO, useCreateReserve, useDeleteReserve, useUpdateReserve } from '@/shared/api/reserve/reserve';
import { Room, useCreateRoom, useGetRoomsWithReservesByHotel } from '@/shared/api/room/room';
import { QUERY_KEYS } from '@/shared/config/reactQuery';
import { getDateFromUnix } from '@/shared/lib/date';
import { $hotelsFilter, TravelFilterType } from '@/shared/models/hotels';
import { $isMobile } from '@/shared/models/mobile';
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from 'antd';
import { useUnit } from 'effector-react/compat';
import moment from 'moment';
import 'moment/locale/ru';
import { CustomHeader, Id, SidebarHeader, Timeline, TimelineHeaders } from 'my-react-calendar-timeline';
import { nanoid } from 'nanoid';
import React, { useCallback, useMemo, useState } from 'react';
import { BiSortDown, BiSortUp } from 'react-icons/bi';
import { CiSquarePlus } from 'react-icons/ci';
import '../../../../app/main/reservation/calendar.scss';
import cx from './style.module.scss';

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

export interface CalendarProps {
    hotel: HotelDTO;
}

const DAY = 24 * 60 * 60 * 1000;
const WEEK = DAY * 7;
const THREE_MONTHS = DAY * 30 * 24;
// const THREE_MONTHS = 5 * 365.24 * 86400 * 1000;

export const HotelCalendar = ({ hotel }: CalendarProps) => {
    const [isMobile] = useUnit([$isMobile]);
    const filter = useUnit($hotelsFilter);
    const queryClient = useQueryClient();
    const { data, isFetching: isRoomLoading } = useGetRoomsWithReservesByHotel(hotel.id, filter, true);

    const [currentReserve, setCurrentReserve] = useState<Nullable<CurrentReserveType>>(null);
    const [isRoomOpen, setIsRoomOpen] = useState<boolean>(false);
    const [isReserveOpen, setIsReserveOpen] = useState<boolean>(false);
    const [sort, setSort] = useState<'asc' | 'desc'>('asc');

    const {
        isPending: isReserveCreating,
        mutateAsync: createReserve,
        error: reserveError,
    } = useCreateReserve(
        () => {
            queryClient.invalidateQueries({
                queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel.id],
            });
            setCurrentReserve(null);
            setIsReserveOpen(false);
        },
        (e) => {
            showToast(`Ошибка при обновлении брони ${e}`, 'error');
        },
    );

    const { isPending: isReserveUpdating, mutate: updateReserve } = useUpdateReserve(
        () => {
            queryClient.invalidateQueries({
                queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel.id],
            });
            setCurrentReserve(null);
            setIsReserveOpen(false);
        },
        (e) => {
            showToast('Ошибка при обновлении брони', 'error');
        },
    );

    const { isPending: isReserveDeleting, mutateAsync: deleteReserve } = useDeleteReserve(() => {
        queryClient.invalidateQueries({
            queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel.id],
        });
        setCurrentReserve(null);
        setIsReserveOpen(false);
    });

    const {
        isPending: isRoomCreating,
        mutate: createRoom,
        error: roomError,
    } = useCreateRoom(
        () => {
            queryClient.invalidateQueries({
                queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel.id],
            });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.roomsByHotel });
            setCurrentReserve(null);
            setIsRoomOpen(false);
            showToast('Номер успешно добавлен');
        },
        (e) => {
            showToast(`Ошибка при добавлении номера ${e}`, 'error');
        },
    );

    const onRoomCreate = useCallback((room: Room) => {
        createRoom(room);
        console.log('Создаю ROOM', room);
    }, []);

    const onReserveAccept = async (reserve: Reserve) => {
        const isEdit = currentReserve?.reserve?.id;

        if (isEdit) {
            console.log('Пытаюсь обновить запись');
            await updateReserve(reserve as ReserveDTO);

            return;
        }

        await createReserve(reserve);
    };

    const onReserveDelete = async (id: string) => {
        console.log('Пытаюсь удалить запись');
        await deleteReserve(id);

        return;
    };

    const onClose = () => {
        // queryClient.invalidateQueries({queryKey: [QUERY_KEYS.hotelsForRoom]})
        // queryClient.invalidateQueries({queryKey: [QUERY_KEYS.roomsByHotel]})
        setIsReserveOpen(false);
        setCurrentReserve(null);
    };

    const hotelRooms = useMemo(() => {
        let rooms =
            data?.map(({ reserves, id, title, ...room }) => ({
                id,
                title: `${title}`,
                ...room,
            })) ?? [];

        rooms = rooms.sort((a, b) => {
            if (sort === 'asc') {
                return a.title.localeCompare(b.title, undefined, {
                    caseFirst: 'upper',
                });
            } else {
                return b.title.localeCompare(b.title, undefined, {
                    caseFirst: 'upper',
                    sensitivity: 'case',
                });
            }
        });

        return rooms;
    }, [data, sort]);
    //
    let hotelReserves: Array<ReserveDTO & { group: string }> = [];

    const onReserveAdd = (groupId: Id, time: number, e: React.SyntheticEvent) => {
        const room = hotelRooms?.find((group) => group.id === groupId);
        if (room) {
            setCurrentReserve({
                room,
                hotel,
                reserve: {
                    start: time,
                    end: getDateFromUnix(time).add(1, 'day').unix(),
                },
            });
            setIsReserveOpen(true);
        }
    };
    data?.forEach(({ id: room_id, reserves }) => {
        const reservesTmp = reserves.map(({ end, start, ...reserve }) => ({
            ...reserve,
            id: reserve.id,
            group: room_id,
            end: getDateFromUnix(end),
            start: getDateFromUnix(start),
        }));

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        hotelReserves = hotelReserves.concat(reservesTmp);
    });

    // @ts-nocheck
    const itemRenderer = ({ item, itemContext, getItemProps, getResizeProps }: { item: any; itemContext: any; getItemProps: (item: any) => any; getResizeProps: (item: any) => any }) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const { left: leftResizeProps, right: rightResizeProps } = getResizeProps();

        const onItemClick = (reserve: ReserveDTO, hotel: HotelDTO) => {
            const room = hotelRooms.find((room) => room.id === reserve?.room_id);

            if (room) {
                setCurrentReserve({ room, reserve, hotel });
                setIsReserveOpen(true);
            }
        };

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
                <div className={`${cx.calendarItem} rct-item-content`} style={{ maxHeight: `${itemContext.dimensions.height}` }}>
                    {item?.guest} {item?.phone}
                </div>

                {itemContext.useResizeHandle ? <div {...rightResizeProps} /> : ''}
            </div>
        );
    };

    const isLoading = isRoomLoading || isRoomCreating;
    const reserveLoading = isReserveCreating || isReserveUpdating;

    const getDefaultTime = (isMobile: boolean, filter: TravelFilterType) => {
        let defaultTimeStart = moment().add(-15, 'day');
        let defaultTimeEnd = moment().add(15, 'day');

        if (filter?.start) {
            defaultTimeStart = getDateFromUnix(filter?.start).add(-2, 'day');
            defaultTimeEnd = getDateFromUnix(filter?.start).add(15, 'day');
        }

        if (isMobile) {
            defaultTimeStart = moment().add(-3, 'day');
            defaultTimeEnd = moment().add(3, 'day');
        }

        console.log(isMobile, 'isMobile');
        return { defaultTimeStart, defaultTimeEnd };
    };
    const { defaultTimeStart, defaultTimeEnd } = getDefaultTime(isMobile, filter);

    const [currentUnit, setCurrentUnit] = useState('day');
    return (
        <>
            <div>
                {isLoading && <FullWidthLoader />}
                <div className={cx.hotelInfo}></div>
                <div className={cx.calendar}>
                    <Timeline
                        onZoom={(context, unit) => setCurrentUnit(unit)}
                        className={'hotelTimeline'}
                        groups={hotelRooms}
                        items={hotelReserves}
                        keys={keys}
                        sidebarWidth={isMobile ? 100 : 230}
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
                    >
                        <TimelineHeaders className={cx.calendarHeader}>
                            <SidebarHeader>
                                {({ getRootProps }) => {
                                    return (
                                        <div {...getRootProps()} className={cx.calendarHeader}>
                                            <Button
                                                icon={<CiSquarePlus size={24} />}
                                                type={'link'}
                                                onClick={() => {
                                                    setCurrentReserve({ hotel: hotel });
                                                    setIsRoomOpen(true);
                                                }}
                                            />
                                            {sort === 'asc' ? (
                                                <Button
                                                    icon={<BiSortDown size={24} />}
                                                    type={'link'}
                                                    title={'В алфавитном порядке А-Я'}
                                                    onClick={() => {
                                                        setSort('desc');
                                                    }}
                                                />
                                            ) : (
                                                <Button
                                                    icon={<BiSortUp size={24} />}
                                                    type={'link'}
                                                    title={'В алфавитном порядке А-Я'}
                                                    onClick={() => {
                                                        setSort('asc');
                                                    }}
                                                />
                                            )}
                                        </div>
                                    );
                                }}
                            </SidebarHeader>
                            <CustomHeader unit={currentUnit === 'day' ? 'month' : 'year'}>
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
                                                const dateText = isYear ? moment(interval.startTime.toDate()).format('YYYY') : moment(interval.startTime.toDate()).format('MMM');

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
                            <CustomHeader headerData={{ someData: 'data' }}>
                                {({ headerContext: { intervals, unit }, getRootProps, getIntervalProps, showPeriod }) => {
                                    return (
                                        <div {...getRootProps()}>
                                            {intervals.map((interval) => {
                                                const isMonth = unit === 'month';

                                                const dateText = isMonth ? moment(interval.startTime.toDate()).format('MMM') : interval.startTime.format('DD');

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
                    </Timeline>
                </div>
                <RoomModal isOpen={isRoomOpen} onClose={() => setIsRoomOpen(false)} onAccept={onRoomCreate} isLoading={isRoomCreating} currentReserve={currentReserve} />
            </div>
            <ReserveModal isOpen={isReserveOpen} onClose={onClose} onAccept={onReserveAccept} onDelete={onReserveDelete} currentReserve={currentReserve} isLoading={reserveLoading} />
        </>
    );
};
