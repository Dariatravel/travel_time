import { Interval } from '@/features/Calendar/ui/Intervals'
import { ReserveModal } from '@/features/ReserveInfo/ui/ReserveModal'
import { RoomModal } from '@/features/RoomInfo/ui/RoomModal'
import { HotelDTO } from '@/shared/api/hotel/hotel'
import {
  CurrentReserveType,
  Nullable,
  Reserve,
  ReserveDTO,
  useCreateReserve,
  useDeleteReserve,
  useUpdateReserve,
} from '@/shared/api/reserve/reserve'
import {
  Room,
  useCreateRoom,
  useGetRoomsWithReservesByHotel,
} from '@/shared/api/room/room'
import { QUERY_KEYS } from '@/shared/config/reactQuery'
import { ZOOM_UNITS, ZoomUnit } from '@/shared/lib/const'
import { getDateFromUnix } from '@/shared/lib/date'
import { devLog } from '@/shared/lib/logger'
import { $hotelsFilter, TravelFilterType } from '@/shared/models/hotels'
import { $isMobile } from '@/shared/models/mobile'
import { HotelImage } from '@/shared/ui/Hotel/HotelImage/HotelImage'
import { HotelTelegram } from '@/shared/ui/Hotel/HotelTelegram'
import { HotelTitle } from '@/shared/ui/Hotel/HotelTitle'
import { FullWidthLoader } from '@/shared/ui/Loader/Loader'
import { showToast } from '@/shared/ui/Toast/Toast'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Flex } from 'antd'
import { useUnit } from 'effector-react/compat'
import moment from 'moment'
import 'moment/locale/ru'
import {
  CustomHeader,
  Id,
  SidebarHeader,
  Timeline,
  TimelineHeaders,
} from 'my-react-calendar-timeline'
import { nanoid } from 'nanoid'
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { CiSquarePlus, CiZoomIn, CiZoomOut } from 'react-icons/ci'
import '../../../app/main/reservation/calendar.scss'
import hotelImage from '../hotel.svg'
import cx from './style.module.scss'

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
}

export interface CalendarProps {
  hotel: HotelDTO
  onHotelClick?: (hotel_id: string) => void
}

const DAY = 24 * 60 * 60 * 1000
const WEEK = DAY * 7
const THREE_MONTHS = DAY * 30 * 24
// const THREE_MONTHS = 5 * 365.24 * 86400 * 1000;
export const Calendar = ({ hotel, onHotelClick }: CalendarProps) => {
  const [isMobile] = useUnit([$isMobile])
  const filter = useUnit($hotelsFilter)
  const queryClient = useQueryClient()
  const { data, isFetching: isRoomLoading } = useGetRoomsWithReservesByHotel(
    hotel.id,
    filter,
    true
  )

  const timelineRef = useRef<Timeline>(null)
  const [currentReserve, setCurrentReserve] =
    useState<Nullable<CurrentReserveType>>(null)
  const [isRoomOpen, setIsRoomOpen] = useState<boolean>(false)
  const [isReserveOpen, setIsReserveOpen] = useState<boolean>(false)
  const [sort, setSort] = useState<'asc' | 'desc'>('asc')
  const [currentUnit, setCurrentUnit] = useState<ZoomUnit>('day')

  const {
    isPending: isReserveCreating,
    mutateAsync: createReserve,
    error: reserveError,
  } = useCreateReserve(
    () => {
      queryClient.invalidateQueries({
        queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel.id],
      })
      setCurrentReserve(null)
      setIsReserveOpen(false)
    },
    e => {
      showToast(`Ошибка при обновлении брони ${e}`, 'error')
    }
  )

  const { isPending: isReserveUpdating, mutate: updateReserve } =
    useUpdateReserve(
      () => {
        queryClient.invalidateQueries({
          queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel.id],
        })
        setCurrentReserve(null)
        setIsReserveOpen(false)
      },
      e => {
        showToast('Ошибка при обновлении брони', 'error')
      }
    )

  const { isPending: isReserveDeleting, mutateAsync: deleteReserve } =
    useDeleteReserve(() => {
      queryClient.invalidateQueries({
        queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel.id],
      })
      setCurrentReserve(null)
      setIsReserveOpen(false)
    })

  const {
    isPending: isRoomCreating,
    mutate: createRoom,
    error: roomError,
  } = useCreateRoom(
    () => {
      queryClient.invalidateQueries({
        queryKey: [...QUERY_KEYS.roomsWithReservesByHotel, hotel.id],
      })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.roomsByHotel })
      setCurrentReserve(null)
      setIsRoomOpen(false)
      showToast('Номер успешно добавлен')
    },
    e => {
      showToast(`Ошибка при добавлении номера ${e}`, 'error')
    }
  )

  const onRoomCreate = useCallback((room: Room) => {
    createRoom(room)
    devLog('Создаю ROOM', room)
  }, [])

  const onReserveAccept = async (reserve: Reserve) => {
    const isEdit = currentReserve?.reserve?.id

    if (isEdit) {
      devLog('Пытаюсь обновить запись')
      await updateReserve(reserve as ReserveDTO)

      return
    }

    await createReserve(reserve)
  }

  const onReserveDelete = async (id: string) => {
    devLog('Пытаюсь удалить запись')
    await deleteReserve(id)

    return
  }

  const onClose = () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.hotelsForRoom] })
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.roomsByHotel] })
    setIsReserveOpen(false)
    setCurrentReserve(null)
  }

  const hotelRooms = useMemo(() => {
    const rooms =
      data?.map(({ reserves, id, title, ...room }) => ({
        id,
        title: `${title}`,
        ...room,
      })) ?? []

    // rooms = rooms.sort((a, b) => {
    //   if (sort === 'asc') {
    //     return a.title.localeCompare(b.title, 'ru', {
    //       numeric: true,
    //       caseFirst: 'upper',
    //     })
    //   } else {
    //     return b.title.localeCompare(b.title, 'ru', {
    //       caseFirst: 'upper',
    //       sensitivity: 'case',
    //       numeric: true,
    //     })
    //   }
    // })

    return rooms
  }, [data, sort])
  //
  let hotelReserves: Array<ReserveDTO & { group: string }> = []

  data?.forEach(({ id: room_id, reserves }) => {
    const reservesTmp = reserves.map(({ end, start, ...reserve }) => ({
      ...reserve,
      id: reserve.id,
      group: room_id,
      end: getDateFromUnix(end),
      start: getDateFromUnix(start),
    }))

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    hotelReserves = hotelReserves.concat(reservesTmp)
  })

  const onReserveAdd = (groupId: Id, time: number, e: React.SyntheticEvent) => {
    const room = hotelRooms?.find(group => group.id === groupId)
    if (room) {
      setCurrentReserve({
        room,
        hotel,
        reserve: {
          start: time,
          end: getDateFromUnix(time).add(1, 'day').unix(),
        },
      })
      setIsReserveOpen(true)
    }
  }

  // @ts-nocheck
  const itemRenderer = ({
    item,
    itemContext,
    getItemProps,
    getResizeProps,
  }: {
    item: any
    itemContext: any
    getItemProps: (item: any) => any
    getResizeProps: (item: any) => any
  }) => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    const { left: leftResizeProps, right: rightResizeProps } = getResizeProps()

    const onItemClick = (reserve: ReserveDTO, hotel: HotelDTO) => {
      const room = hotelRooms.find(room => room.id === reserve?.room_id)

      if (room) {
        setCurrentReserve({ room, reserve, hotel })
        setIsReserveOpen(true)
      }
    }

    return (
      <div
        {...getItemProps(item.itemProps)}
        key={nanoid()}
        onDoubleClick={() => {
          onItemClick(item, hotel)
        }}
        onTouchEnd={() => {
          onItemClick(item, hotel)
        }}
      >
        {itemContext.useResizeHandle ? <div {...leftResizeProps} /> : ''}
        <div
          className={`${cx.calendarItem} rct-item-content`}
          style={{ maxHeight: `${itemContext.dimensions.height}` }}
        >
          {item?.guest} {item?.phone}
        </div>

        {itemContext.useResizeHandle ? <div {...rightResizeProps} /> : ''}
      </div>
    )
  }

  const isLoading = isRoomLoading || isRoomCreating
  const reserveLoading = isReserveCreating || isReserveUpdating

  const getDefaultTime = (isMobile: boolean, filter: TravelFilterType) => {
    let defaultTimeStart = moment().add(-15, 'day')
    let defaultTimeEnd = moment().add(15, 'day')

    if (filter?.start) {
      defaultTimeStart = getDateFromUnix(filter?.start).add(-2, 'day')
      defaultTimeEnd = getDateFromUnix(filter?.start).add(15, 'day')
    }

    if (isMobile) {
      defaultTimeStart = moment().add(-3, 'day')
      defaultTimeEnd = moment().add(3, 'day')
    }

    return { defaultTimeStart, defaultTimeEnd }
  }
  const { defaultTimeStart, defaultTimeEnd } = getDefaultTime(isMobile, filter)

  const onCreate = () => {
    setCurrentReserve({ hotel: hotel })
    setIsReserveOpen(true)
  }

  const sidebarWidth = useMemo(() => (isMobile ? 100 : 230), [isMobile])

  const onZoomIn = (unit: ZoomUnit) => {
    const currentIndex = ZOOM_UNITS.indexOf(unit)
    const isDay = timelineRef.current?.getTimelineUnit() === 'day'

    if (isDay) return

    if (currentIndex < ZOOM_UNITS.length - 1) {
      setCurrentUnit(ZOOM_UNITS[currentIndex + 1])
    }
    timelineRef.current?.changeZoom(-1, 0.5)
  }

  const onZoomOut = (unit: ZoomUnit) => {
    const currentIndex = ZOOM_UNITS.indexOf(unit)
    const isYear = timelineRef.current?.getTimelineUnit() === 'year'

    if (isYear) return

    timelineRef.current?.changeZoom(1.5, 2)
    if (currentIndex > 0) {
      setCurrentUnit(ZOOM_UNITS[currentIndex - 1])
    }
  }

  const getHeaderUnit = (
    currentUnit: ZoomUnit,
    isFirstHeader: boolean
  ): 'day' | 'month' | 'year' => {
    const currentIndex = ZOOM_UNITS.indexOf(currentUnit)

    if (isFirstHeader) {
      // Для первого заголовка берем следующий уровень
      return currentIndex < ZOOM_UNITS.length - 1
        ? ZOOM_UNITS[currentIndex + 1]
        : ZOOM_UNITS[currentIndex]
    } else {
      // Для второго заголовка используем текущий уровень
      return currentUnit
    }
  }

  const isEmpty = !hotelRooms?.length

  if (isEmpty) {
    return null
  }

  return (
    <>
      <Flex gap={'middle'} className={cx.container} vertical={isMobile}>
        {isLoading && <FullWidthLoader />}
        <div className={cx.hotelInfo}>
          <HotelImage
            type={hotel?.type}
            className={cx.hotelIcon}
            tagClassName={cx.hotelTag}
            src={hotelImage.src}
            onClick={() => (onHotelClick ? onHotelClick(hotel?.id) : undefined)}
          />

          <div className={cx.hotelDescription}>
            <HotelTitle
              size={isMobile ? 's' : 'xl'}
              className={cx.hotelTitle}
              onClick={() =>
                onHotelClick ? onHotelClick(hotel?.id) : undefined
              }
            >
              {hotel?.title}
            </HotelTitle>
            <div>{hotel?.address}</div>
            <div>
              {hotel?.telegram_url && (
                <HotelTelegram url={hotel?.telegram_url} />
              )}
            </div>
          </div>
        </div>

        {!!hotelRooms?.length && (
          <div className={cx.calendarContainer}>
            <Timeline
              ref={timelineRef}
              onZoom={(context, unit) => setCurrentUnit(unit as ZoomUnit)}
              className={'travel-timeline'}
              groups={hotelRooms}
              items={hotelReserves}
              keys={keys}
              sidebarWidth={sidebarWidth}
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
                  onReserveAdd(groupId, time, e)
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
                          onClick={onCreate}
                        />
                        {/* TODO: Сортировка отключена по просьбе Михаила - лучше, чтобы здесь была сортировка по дате создания */}
                        {/* {sort === 'asc' ? (
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
                                                )} */}
                        <Button
                          icon={<CiZoomIn size={24} />}
                          type={'link'}
                          onClick={() => onZoomIn(currentUnit)}
                        />
                        <Button
                          icon={<CiZoomOut size={24} />}
                          type={'link'}
                          onClick={() => onZoomOut(currentUnit)}
                        />
                      </div>
                    )
                  }}
                </SidebarHeader>
                <div className={cx.stickyHeader}>
                  <CustomHeader unit={getHeaderUnit(currentUnit, true)}>
                    {({
                      headerContext: { intervals, unit },
                      getRootProps,
                      getIntervalProps,
                      showPeriod,
                    }) => {
                      const isYear = unit === 'year'
                      return (
                        <div {...getRootProps()}>
                          {intervals.map((interval, index) => {
                            const dateText = isYear
                              ? moment(interval.startTime.toDate()).format(
                                  'YYYY'
                                )
                              : moment(interval.startTime.toDate()).format(
                                  'MMM'
                                )

                            // Определяем, является ли интервал первым в видимой области
                            const isFirstVisible = interval === intervals[0]
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
                                  position: 'sticky',
                                  left: isFirstVisible ? 0 : 'auto',
                                  zIndex: 100,
                                }}
                                key={nanoid()}
                                className={index === 0 ? cx.intervalSticky : ''}
                              />
                            )
                          })}
                        </div>
                      )
                    }}
                  </CustomHeader>
                </div>
                <CustomHeader unit={getHeaderUnit(currentUnit, false)}>
                  {({
                    headerContext: { intervals, unit },
                    getRootProps,
                    getIntervalProps,
                    showPeriod,
                  }) => {
                    return (
                      <div {...getRootProps()}>
                        {intervals.map(interval => {
                          const isMonth = unit === 'month'
                          const isYear = unit === 'year'

                          const dateText =
                            isMonth || isYear
                              ? moment(interval.startTime.toDate()).format(
                                  'MMM'
                                )
                              : interval.startTime.format('DD')

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
                          )
                        })}
                      </div>
                    )
                  }}
                </CustomHeader>
              </TimelineHeaders>
            </Timeline>
          </div>
        )}
      </Flex>
      <RoomModal
        isOpen={isRoomOpen}
        onClose={() => setIsRoomOpen(false)}
        onAccept={onRoomCreate}
        isLoading={isRoomCreating}
        currentReserve={currentReserve}
      />
      <ReserveModal
        isOpen={isReserveOpen}
        onClose={onClose}
        onAccept={onReserveAccept}
        onDelete={onReserveDelete}
        currentReserve={currentReserve}
        isLoading={reserveLoading}
      />
    </>
  )
}
