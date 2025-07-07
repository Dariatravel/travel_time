import { HOTEL_TYPES } from '@/features/HotelModal/lib/const'
import {
  FreeHotelsDTO,
  getHotelsWithFreeRooms,
  useGetHotelsForRoom,
} from '@/shared/api/hotel/hotel'
import { PagesEnum, routes } from '@/shared/config/routes'
import { adaptToAntOption } from '@/shared/lib/adaptHotel'
import { useScreenSize } from '@/shared/lib/useScreenSize'
import { changeTravelFilter, TravelFilterType } from '@/shared/models/hotels'
import { Button } from '@consta/uikit/Button'
import { Flex, Input, Select, SelectProps } from 'antd'
import cn from 'classnames'
import moment from 'moment/moment'
import { useRouter } from 'next/navigation'
import { FC, useState } from 'react'
import styles from './style.module.scss'
import { DatePicker } from '@consta/uikit/DatePicker'
import { IconCalendar } from '@consta/icons/IconCalendar'
import { cloneDeep } from 'lodash'

export interface SearchFeatureProps {}

export const SearchFeature: FC<SearchFeatureProps> = (
  props: SearchFeatureProps
) => {
  const [date, setValue] = useState<[Date?, Date?] | null>(null)
  const [category, setCategory] = useState<string | undefined>()
  const [quantity, setQuantity] = useState<number | undefined>(undefined)
  const [selectedHotels, setSelectedHotels] = useState<string[]>([])
  const router = useRouter()
  const { isMobile } = useScreenSize()
  const { data: hotels, isLoading: isHotelsLoading } = useGetHotelsForRoom()
  let start_time = undefined,
    end_time = undefined

  if (date?.[0]) {
    start_time = moment(date[0]).hour(12).unix()
  }

  if (date?.[1]) {
    end_time = moment(date[1]).hour(11).unix()
  }

  const onSearch = async () => {
    const filter: Partial<TravelFilterType> = {
      type: category ?? undefined,
      start: start_time,
      end: end_time,
      quantity: quantity ?? undefined,
    }

    /**
     * Проверяет, что все значения объекта равны undefined
     * @param obj объект для проверки
     */
    const isAllValuesUndefined = (obj: Record<string, unknown>) => {
      const filter = cloneDeep(obj)
      const EXCEPTED_KEY = 'hotels'
      if (filter && filter?.hotels) {
        delete filter[EXCEPTED_KEY]
      }

      return Object.values(filter).every(value => {
        return value === undefined
      })
    }

    let freeRoomData: Partial<TravelFilterType> = {
      freeHotels: undefined,
      freeHotels_id: undefined,
    }

    console.log({ filter, und: isAllValuesUndefined(filter) })
    if (!isAllValuesUndefined(filter)) {
      const result = await getHotelsWithFreeRooms(filter)

      const getHotelsMap = (hotels: FreeHotelsDTO[]) => {
        const getUniqueRooms = (rooms: string[]) => {
          return Array.from(new Set(rooms))
        }
        return new Map(
          hotels.map(hotel => [
            hotel.hotel_id,
            getUniqueRooms(hotel.rooms.map(room => room.room_id)),
          ])
        )
      }

      freeRoomData = {
        freeHotels_id: result?.map(hotel => hotel.hotel_id),
        freeHotels: getHotelsMap(result),
      }
    }

    if (selectedHotels.length !== 0) {
      const filterHotels = hotels?.filter(hotel =>
        selectedHotels.includes(hotel.id)
      )
      filter.hotels = filterHotels
    } else {
      filter.hotels = undefined
    }

    console.log(filter)
    changeTravelFilter({ ...filter, ...freeRoomData })

    if (window.location.pathname !== routes[PagesEnum.RESERVATION]) {
      router.push(routes[PagesEnum.RESERVATION])
    }
  }

  const FORM_SIZE = isMobile ? 's' : 'm'

  const handleChange = (value: string[]) => {
    setSelectedHotels(value)
  }

  const hotelOptions = hotels?.map(hotel => adaptToAntOption(hotel)) ?? []
  return (
    <Flex gap={'small'} wrap={isMobile}>
      <Flex className={styles.container} wrap>
        <Select
          style={{ flex: '1 1 auto' }}
          className={cn(styles.categorySelect)}
          options={HOTEL_TYPES}
          value={category}
          onChange={type => {
            setCategory(type)
          }}
          placeholder={'Категория'}
          allowClear
          size={FORM_SIZE === 's' ? 'middle' : 'large'}
        />
        <Input
          className={styles.quantityInput}
          type="number"
          value={quantity}
          min={0}
          placeholder={'Гости'}
          onChange={e =>
            setQuantity(!!e.target.value ? Number(e.target.value) : undefined)
          }
          allowClear
          size={FORM_SIZE === 's' ? 'middle' : 'large'}
        />
        <DatePicker
          style={{ flex: '1 1 100px' }}
          className={styles.datePicker}
          type="date-range"
          value={date}
          onChange={e => setValue(e)}
          leftSide={[IconCalendar, IconCalendar]}
          placeholder={['Заезд', 'Выезд']}
          dateTimeView={'classic'}
          withClearButton
          size={FORM_SIZE}
          dropdownClassName={styles.datepickerDropdown}
        />
        <Select
          loading={isHotelsLoading}
          mode="multiple"
          allowClear
          style={{ flex: '1 0 100%' }}
          value={selectedHotels}
          placeholder="Выберите отели"
          onChange={handleChange}
          options={hotelOptions}
          filterOption={(inputValue, option) => {
            if (inputValue) {
              return (
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-expect-error
                option.label
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-expect-error
                  .toLowerCase()
                  .includes(inputValue.toLowerCase())
              )
            } else {
              return true
            }
          }}
          size={FORM_SIZE === 's' ? 'middle' : 'large'}
        />
      </Flex>{' '}
      <Button
        style={{ flex: '1 0 auto' }}
        className={styles.searchButton}
        label={'Найти'}
        onClick={onSearch}
        size={FORM_SIZE}
      />
    </Flex>
  )
}
