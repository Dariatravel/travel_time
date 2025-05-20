import { ReserveTotal } from '@/features/ReserveInfo/ui/ReserveTotal'
import { useGetHotelsForRoom } from '@/shared/api/hotel/hotel'
import {
  type CurrentReserveType,
  Nullable,
  Reserve,
  ReserveDTO,
  ReserveForm,
} from '@/shared/api/reserve/reserve'
import { useGetRoomsByHotel } from '@/shared/api/room/room'
import { adaptToOption } from '@/shared/lib/adaptHotel'
import { FORM_SIZE } from '@/shared/lib/const'
import { getDate } from '@/shared/lib/getDate'
import { $user } from '@/shared/models/auth'
import { FormButtons } from '@/shared/ui/FormButtons/FormButtons'
import { FormTitle } from '@/shared/ui/FormTitle/FormTitle'
import { PhoneInput } from '@/shared/ui/PhoneInput/PhoneInput'
import { showToast } from '@/shared/ui/Toast/Toast'
import { IconCalendar } from '@consta/icons/IconCalendar'
import { TextFieldPropStatus } from '@consta/uikit/__internal__/src/components/TextField/types'
import { DatePicker } from '@consta/uikit/DatePicker'
import { FieldGroup } from '@consta/uikit/FieldGroup'
import { Select } from '@consta/uikit/Select'
import { Text } from '@consta/uikit/Text'
import { TextField } from '@consta/uikit/TextField'
import { Flex, Input } from 'antd'
import cn from 'classnames'
import dayjs from 'dayjs'
import { useUnit } from 'effector-react/compat'
import moment from 'moment'
import { FC, useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import cx from './style.module.css'

export interface ReserveInfoProps {
  onClose: () => void
  onAccept: (reserve: Reserve | ReserveDTO) => void
  currentReserve?: Nullable<CurrentReserveType>
  isLoading: boolean
  isEdit?: boolean
  onDelete?: (id: string) => void
}

export const ReserveInfo: FC<ReserveInfoProps> = ({
  onAccept,
  onClose,
  onDelete,
  currentReserve,
  isLoading,
  isEdit,
}: ReserveInfoProps) => {
  const {
    data: hotels,
    isLoading: isHotelsLoading,
    status: hotelsStatus,
  } = useGetHotelsForRoom()

  const user = useUnit($user)

  const getDefaultValues = ({
    reserve,
    room,
    hotel,
  }: CurrentReserveType): Partial<ReserveForm> => {
    const getReserveDefaults = ({
      start,
      end,
      price,
      prepayment,
      guest,
      phone,
      comment,
      quantity,
    }: Partial<ReserveDTO>) => {
      const currentDate: [Date, Date] =
        start && end
          ? [new Date(start), new Date(end)]
          : [new Date(), new Date()]
      return {
        date: currentDate,
        price,
        prepayment: prepayment ? String(prepayment) : String(0),
        guest,
        phone,
        comment,
        quantity,
      }
    }

    let defaults = {
      date: [moment().toDate(), moment().add(1, 'days').toDate()] as [
        Date,
        Date,
      ],
      hotel_id: hotel
        ? adaptToOption({
            id: hotel?.id,
            title: hotel?.title,
          })
        : undefined,
      room_id: room
        ? adaptToOption({
            id: room?.id,
            title: room?.title,
          })
        : undefined,
      price: room?.price,
      created_by: currentReserve?.reserve?.created_by,
      edited_by: currentReserve?.reserve?.edited_by,
      created_at: currentReserve?.reserve?.created_at,
      edited_at: currentReserve?.reserve?.edited_at,
    }

    if (!!reserve) {
      defaults = { ...defaults, ...getReserveDefaults(reserve) }
    }

    return defaults
  }

  const {
    control,
    register,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ReserveForm>({
    mode: 'onSubmit',
    defaultValues: currentReserve?.hotel
      ? getDefaultValues(currentReserve)
      : undefined,
  })

  const formData = watch()

  const {
    data: rooms,
    isLoading: isRoomsLoading,
    refetch: fetchRoomsByHotel,
    status: roomsStatus,
  } = useGetRoomsByHotel(formData?.hotel_id?.id, false)

  const hotelOptions = useMemo(() => {
    const hotelsTmp = hotels?.map(adaptToOption)

    return hotelsTmp ?? []
  }, [hotels])

  const roomOptions = useMemo(() => {
    const hotelsTmp = rooms?.map(adaptToOption)

    return hotelsTmp ?? []
  }, [rooms])

  useEffect(() => {
    if (hotelsStatus === 'success' && !!formData.hotel_id) {
      fetchRoomsByHotel()
    }
  }, [hotelsStatus, formData.hotel_id])

  useEffect(() => {
    // если комнат нет - выходим
    if (rooms?.length === 0 || !!currentReserve?.reserve?.price) return

    const room = rooms?.find(room => room.id === formData?.room_id?.id)

    if (room) {
      setValue('price', room?.price)
    }
  }, [formData.room_id])

  const loading = isLoading || isHotelsLoading

  const deserializeData = ({
    hotel_id,
    date,
    price,
    quantity,
    prepayment = 0,
    ...data
  }: ReserveForm) => {
    const start = moment(date[0]).hour(12).unix()
    const userName = `${user?.role} ${user?.name} ${user?.surname}`
    const end = moment(date[1]).hour(11).unix()
    const room_id = data.room_id?.id
    const priceNumber = +price
    const quantityNumber = +quantity
    const prepaymentNumber = +prepayment
    const created_by = data?.created_by ?? userName
    const edited_by = userName
    const created_at = data?.created_at ?? getDate()
    const edited_at = data?.edited_at ?? getDate()

    return {
      ...data,
      room_id,
      start,
      end,
      price: priceNumber,
      quantity: quantityNumber,
      prepayment: prepaymentNumber,
      created_by,
      edited_by,
      created_at,
      edited_at,
    }
  }

  const onAcceptForm = (formData: ReserveForm) => {
    if (!formData?.date?.[0] || !formData?.date?.[1]) {
      showToast('Ошибка при создании брони, проверьте даты', 'error')
      return
    }

    const data = deserializeData(formData)
    onAccept(
      currentReserve ? { ...data, id: currentReserve?.reserve?.id } : data
    )
  }

  const getError = (
    field: keyof ReserveDTO,
    errors: Record<string, unknown>
  ) => {
    if (!errors?.[field]) {
      return {
        status: undefined,
        caption: undefined,
      }
    }

    return {
      status: 'alert' as TextFieldPropStatus,
      caption: errors[field],
    }
  }

  const onReserveDelete = () => {
    if (!currentReserve?.reserve?.id || !onDelete) {
      showToast('Ошибка во время удаления брони, отсутсвует id', 'error')
      return
    }

    onDelete(currentReserve?.reserve?.id)
  }
  return (
    <Flex vertical className={cx.container}>
      <FormTitle>Бронирование</FormTitle>

      <Controller
        name="date"
        control={control}
        rules={{ required: true }}
        render={({ field }) => (
          <DatePicker
            // style={{ zIndex: 'var(--zIndex-fullWidthcontainer)' }}
            required
            value={field.value}
            onChange={e => field.onChange(e)}
            type="date-range"
            leftSide={[IconCalendar, IconCalendar]}
            placeholder={['ДД.ММ.ГГГГ', 'ДД.ММ.ГГГГ']}
            dateTimeView={'classic'}
            withClearButton
            size={FORM_SIZE}
            className={cn(cx.fields)}
            dropdownClassName={cx.dropdown}
          />
        )}
      />
      <FieldGroup size={FORM_SIZE}>
        <Controller
          name="hotel_id"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <Select
              {...field}
              style={{ zIndex: 'var(--zIndex-fullWidthcontainer)' }}
              items={hotelOptions}
              placeholder={'Выберите из списка'}
              label={'Название отеля'}
              required
              size={FORM_SIZE}
              dropdownClassName={cx.dropdown}
              className={cx.fields}
              disabled={loading || !!currentReserve?.hotel?.id}
            />
          )}
        />
        <Controller
          name="room_id"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <Select
              {...field}
              items={roomOptions}
              placeholder={'Выберите из списка'}
              label={'Номер'}
              required
              size={FORM_SIZE}
              dropdownClassName={cx.dropdown}
              className={cx.fields}
              isLoading={isHotelsLoading || isRoomsLoading}
            />
          )}
        />
      </FieldGroup>
      <FieldGroup size={FORM_SIZE}>
        <Controller
          name="price"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <TextField
              {...field}
              placeholder="Введите стоимость"
              label="Стоимость номера"
              required
              size={FORM_SIZE}
              className={cx.fields}
              value={String(field.value)}
              onChange={field.onChange}
              type="number"
              incrementButtons={false}
            />
          )}
        />
        <Controller
          name="quantity"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value?.toString() ?? ''}
              placeholder="Введите число"
              label="Количество человек"
              incrementButtons={false}
              className={cx.fields}
              required
              type={'number'}
              size={FORM_SIZE}
            />
          )}
        />
      </FieldGroup>
      <Controller
        name="guest"
        rules={{ required: true }}
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            placeholder="Введите ФИО"
            label="ФИО гостя"
            className={cx.fields}
            required
            size={FORM_SIZE}
          />
        )}
      />
      <Controller
        name="phone"
        rules={{ required: true }}
        control={control}
        render={({ field }) => (
          <PhoneInput
            control={control}
            name="phone"
            placeholder="+7 (...)"
            required
            label="Номер гостя"
            size={FORM_SIZE}
            className={cx.fields}
            error={errors.phone?.message}
            showWhatsapp
          />
        )}
      />

      <Controller
        name="comment"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            className={cx.fields}
            label="Комментарии"
            type="textarea"
            value={field?.value}
            onChange={field?.onChange}
            cols={200}
            rows={2}
            placeholder="Введите комментарий"
            size={FORM_SIZE}
          />
        )}
      />

      <ReserveTotal
        date={formData?.date}
        price={formData.price}
        prepayment={formData.prepayment}
        className={cx.fields}
        Prepayment={
          <Controller
            name="prepayment"
            control={control}
            render={({ field }) => (
              <Input
                style={{
                  paddingLeft: 0,
                  backgroundColor: 'transparent',
                  maxWidth: '150px',
                  marginBottom: '0rem',
                  paddingBottom: '0rem',
                  paddingTop: 0,
                  // maxHeight: '20px',
                }}
                variant={'underlined'}
                {...field}
                suffix={'руб.'}
                required
                size={'large'}
                className={cx.fields}
                disabled={loading}
                value={String(field?.value)}
                onChange={field.onChange}
                type={'number'}
              />
            )}
          />
        }
      />

      <div className={cx.info}>
        {formData?.created_at && (
          <Flex gap="small">
            <Text view="secondary" size="s">
              Создана {formData?.created_by}
            </Text>
            <Text view="secondary" size="s">
              {dayjs(formData?.created_at).format('DD.MM.YYYY HH:mm')}
            </Text>
          </Flex>
        )}
        {formData?.edited_at && (
          <Flex gap="small">
            <Text view="secondary" size="s">
              Изменена {formData?.edited_by}
            </Text>
            <Text view="secondary" size="s">
              {dayjs(formData?.edited_at).format('DD.MM.YYYY HH:mm')}
            </Text>
          </Flex>
        )}
      </div>
      <FormButtons
        className={cx.buttons}
        onDelete={onReserveDelete}
        deleteText={'Удалить бронь'}
        isEdit={isEdit}
        isLoading={loading}
        onAccept={() => onAcceptForm(formData)}
        onClose={onClose}
      />
    </Flex>
  )
}
