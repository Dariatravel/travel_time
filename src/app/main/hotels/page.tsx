'use client'
import { Hotel } from '@/features/Hotel/Hotel'
import { HotelModal } from '@/features/HotelModal/ui/HotelModal'
import {
  HotelDTO,
  useDeleteHotel,
  useInfiniteHotelsQuery,
} from '@/shared/api/hotel/hotel'
import { Nullable } from '@/shared/api/reserve/reserve'
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery'
import { useScreenSize } from '@/shared/lib/useScreenSize'
import { TravelButton } from '@/shared/ui/Button/Button'
import { FullWidthLoader } from '@/shared/ui/Loader/Loader'
import { PageTitle } from '@/shared/ui/PageTitle/PageTitle'
import { ResponsesNothingFound } from '@consta/uikit/ResponsesNothingFound'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Flex } from 'antd'
import { useEffect, useRef, useState } from 'react'
import style from './page.module.css'

export default function Hotels() {
  const [isHotelOpen, setIsHotelOpen] = useState(false)
  const [currentHotel, setIsCurrentHotel] = useState<Nullable<HotelDTO>>(null)
  const { isMobile } = useScreenSize()

  // Используем бесконечный запрос
  const PAGE_SIZE = 6
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
    refetch,
  } = useInfiniteHotelsQuery(undefined, PAGE_SIZE, true)

  const hotels = data?.pages.flatMap(page => page.data) ?? []

  const { isPending: isHotelDeleting, mutateAsync: deleteHotel } =
    useDeleteHotel(() => {
      queryClient.invalidateQueries({
        queryKey: [...QUERY_KEYS.hotels],
      })
    })

  const loading = isLoading || isHotelDeleting

  // --- Виртуализированная сетка ---
  const parentRef = useRef<HTMLDivElement>(null)
  // Количество колонок адаптивно
  let columnCount = 3
  if (typeof window !== 'undefined') {
    if (window.innerWidth <= 768) columnCount = 1
    else if (window.innerWidth <= 1200) columnCount = 2
  }
  // SSR fallback
  if (isMobile) columnCount = 1

  const rowHeight = isMobile ? 174 : 256
  const gap = isMobile ? 8 : 24
  const rowCount = Math.ceil(hotels.length / columnCount)

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + gap,
    overscan: 4,
  })

  // Получить элементы строки
  const getRowItems = (rowIndex: number) => {
    const startIndex = rowIndex * columnCount
    const endIndex = Math.min(startIndex + columnCount, hotels.length)
    return hotels.slice(startIndex, endIndex)
  }

  useEffect(() => {
    const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse()
    if (
      lastItem &&
      (lastItem.index + 1) * columnCount >= hotels.length &&
      hasNextPage &&
      !isFetchingNextPage &&
      hotels.length > 0
    ) {
      fetchNextPage()
    }
  }, [
    rowVirtualizer.getVirtualItems(),
    hasNextPage,
    isFetchingNextPage,
    hotels.length,
    fetchNextPage,
    columnCount,
  ])

  // useEffect(() => {
  //     refetch();
  //     queryClient.invalidateQueries({
  //         queryKey: [...QUERY_KEYS.hotels],
  //     });
  //     return () => {
  //         queryClient.invalidateQueries({
  //             queryKey: [...QUERY_KEYS.hotels],
  //         });
  //     };
  // }, [hotels]);

  if (loading) {
    return <FullWidthLoader />
  }

  if (!hotels.length) {
    return (
      <div>
        <PageTitle title={'Все отели'} hotels={0} rooms={0} />
        <ResponsesNothingFound
          title={'Отели пока не добавлены'}
          description={'В настоящий момент не добавлено ни одного отеля'}
          actions={
            <TravelButton
              label={'Добавить отель'}
              onClick={() => setIsHotelOpen(true)}
            />
          }
        />
        
        <HotelModal
          isOpen={isHotelOpen}
          onClose={() => {
            setIsCurrentHotel(null)
            setIsHotelOpen(false)
          }}
          currentReserve={null}
        />
      </div>
    )
  }

  const totalCount = {
    hotels: hotels.length,
    rooms: hotels.reduce((prev, curr) => {
      return (prev += curr?.rooms?.length ?? 0)
    }, 0),
  }

  return (
    <div className={style.container}>
      <PageTitle
        title={'Все отели'}
        hotels={totalCount.hotels}
        rooms={totalCount.rooms}
        buttonProps={{
          label: 'Добавить отель',
          onClick: () => setIsHotelOpen(true),
        }}
      />
      <div ref={parentRef} className={style.scrollContainer}>
        <div
          style={{
            width: '100%',
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map(virtualRow => (
            <Flex
              key={virtualRow.key}
              justify="start"
              align="flex-start"
              gap={gap}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: `${rowHeight}px`,
                transform: `translateY(${virtualRow.start}px)`,
                width: '100%',
              }}
            >
              {getRowItems(virtualRow.index).map(hotel => (
                <div key={hotel.id} className={style.hotelContainer}>
                  <Hotel
                    hotel={hotel}
                    onDelete={deleteHotel}
                    onEdit={(hotel: HotelDTO) => {
                      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                      // @ts-expect-error
                      const { rooms, ...rest } = hotel
                      setIsCurrentHotel(rest)
                      setIsHotelOpen(true)
                    }}
                  />
                </div>
              ))}
            </Flex>
          ))}
        </div>
        {isFetchingNextPage && <FullWidthLoader />}
      </div>
      <HotelModal
        isOpen={isHotelOpen}
        onClose={() => {
          setIsCurrentHotel(null)
          setIsHotelOpen(false)
        }}
        currentReserve={{ hotel: currentHotel }}
      />
    </div>
  )
}
