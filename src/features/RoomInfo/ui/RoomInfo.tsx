import { RoomForm, useGetHotelsForRoom } from '@/shared/api/hotel/hotel'
import { CurrentReserveType, Nullable } from '@/shared/api/reserve/reserve'
import { Room, RoomDTO } from '@/shared/api/room/room'
import { adaptToOption } from '@/shared/lib/adaptHotel'
import { FORM_GAP_SIZE, FORM_SIZE } from '@/shared/lib/const'
import { devLog } from '@/shared/lib/logger'
import { FormButtons } from '@/shared/ui/FormButtons/FormButtons'
import { FormTitle } from '@/shared/ui/FormTitle/FormTitle'
import { Button } from '@consta/uikit/Button'
import { DragNDropField } from '@consta/uikit/DragNDropField'
import { Grid, GridItem } from '@consta/uikit/Grid'
import { Select } from '@consta/uikit/Select'
import { Text } from '@consta/uikit/Text'
import { TextField } from '@consta/uikit/TextField'
import { Flex } from 'antd'
import cn from 'classnames'
import { FC, useMemo } from 'react'
import { Controller, SubmitErrorHandler, useForm } from 'react-hook-form'
import cx from './style.module.css'
import { showToast } from '@/shared/ui/Toast/Toast'

export interface RoomInfoProps {
  onClose: () => void
  onAccept: (args?: any) => void
  onDelete: (id: string) => void
  currentReserve?: Nullable<CurrentReserveType>
  isLoading?: boolean
  isEdit?: boolean
}

export const RoomInfo: FC<RoomInfoProps> = ({
  onAccept,
  onClose,
  currentReserve,
  isLoading = false,
  isEdit = false,
  onDelete,
}: RoomInfoProps) => {
  const { data: hotels, isLoading: isHotelsLoading } = useGetHotelsForRoom()

  const loading = isLoading || isHotelsLoading

  const {
    control,
    watch,
    formState: { errors },
    trigger,
    handleSubmit,
  } = useForm<RoomForm>({
    defaultValues: {
      hotel_id: currentReserve?.hotel
        ? adaptToOption({
            id: currentReserve?.hotel?.id,
            title: currentReserve?.hotel?.title,
          })
        : undefined,
      title: currentReserve?.room?.title,
      comment: currentReserve?.room?.comment,
      quantity: currentReserve?.room?.quantity ?? 3,
      price: String(currentReserve?.room?.price ?? ''),
    },
    mode: 'all',
    reValidateMode: 'onBlur',
  })

  const hotelOptions = useMemo(() => {
    const hotelsTmp = hotels?.map(adaptToOption)
    return hotelsTmp ?? []
  }, [hotels])
  const formData = watch()

  const deserializeData = (data: RoomForm): Room | RoomDTO => {
    return {
      ...data,
      id: currentReserve?.room?.id,
      price: Number(data?.price ? data?.price : '0'),
      hotel_id: data?.hotel_id?.id,
      image_path: '',
      image_title: '',
    }
  }

  const onAcceptForm = async () => {
    const data = deserializeData(formData)

    devLog('onAcceptForm', data)
    onAccept(data)
  }

  const onError: SubmitErrorHandler<RoomForm> = errors => {
    showToast(`Заполните все обязательные поля`, 'error')
    return
  }

  return (
    <Flex vertical className={cx.container}>
      <FormTitle>
        {isEdit ? 'Редактирование номера' : 'Добавление номера'}
      </FormTitle>
      <Controller
        name="hotel_id"
        control={control}
        rules={{ required: 'Отель обязателен для заполнения' }}
        render={({ field, fieldState: { error } }) => (
          <Select
            {...field}
            items={hotelOptions}
            placeholder={'Выберите из списка'}
            label={'Название отеля'}
            required
            size={FORM_SIZE}
            dropdownClassName={cx.dropdown}
            className={cx.fields}
            disabled={loading || !!currentReserve?.hotel?.id}
            status={error?.message ? 'alert' : undefined}
            caption={error?.message}
          />
        )}
      />

      <Controller
        name="title"
        control={control}
        rules={{ required: 'Название номера обязательно для заполнения' }}
        render={({ field, fieldState: { error } }) => (
          <TextField
            {...field}
            placeholder="Введите название"
            label="Название номера"
            required
            size={FORM_SIZE}
            className={cx.fields}
            disabled={loading}
            status={error?.message ? 'alert' : undefined}
            caption={error?.message}
          />
        )}
      />

      <Grid cols={3} gap={FORM_GAP_SIZE}>
        <GridItem col={2}>
          <Controller
            name="price"
            control={control}
            rules={{ required: 'Стоимость номера обязательна для заполнения' }}
            render={({ field, fieldState: { error } }) => (
              <TextField
                {...field}
                value={field?.value}
                placeholder="Введите стоимость"
                label="Стоимость номера"
                required
                size={FORM_SIZE}
                className={cx.fields}
                disabled={loading}
                type="number"
                incrementButtons={false}
                status={error?.message ? 'alert' : undefined}
                caption={error?.message}
              />
            )}
          />
        </GridItem>
        <GridItem>
          <Controller
            name="quantity"
            control={control}
            rules={{ required: 'Вместимость обязательна для заполнения' }}
            render={({ field, fieldState: { error } }) => (
              <TextField
                {...field}
                placeholder="Введите число"
                label="Вместимость"
                required
                value={String(field?.value)}
                size={FORM_SIZE}
                className={cx.fields}
                disabled={loading}
                type="number"
                status={error?.message ? 'alert' : undefined}
                caption={error?.message}
              />
            )}
          />
        </GridItem>
      </Grid>
      <DragNDropField
        onDropFiles={files => devLog('onDropFiles', files)}
        disabled={loading}
        className={cx.fields}
      >
        {({ openFileDialog }) => (
          <>
            <Button onClick={openFileDialog} label="Выбрать файл" />
            <br />
            <Text view="primary">Перетащите изображения или загрузите</Text>
            <Text view="secondary">Поддерживаемые форматы: PNG, TIFF, JPG</Text>
          </>
        )}
      </DragNDropField>
      <Controller
        name="comment"
        control={control}
        rules={{ required: true }}
        render={({ field }) => (
          <TextField
            {...field}
            label="Комментарии"
            type="textarea"
            cols={200}
            rows={3}
            placeholder="Введите комментарий"
            size={FORM_SIZE}
            className={cn(cx.fields, cx.description)}
            disabled={loading}
          />
        )}
      />

      <FormButtons
        className={cx.buttons}
        isLoading={loading}
        onAccept={handleSubmit(onAcceptForm, onError)}
        onClose={onClose}
        isEdit={isEdit}
        onDelete={() =>
          currentReserve?.room?.id && onDelete(currentReserve?.room?.id)
        }
        deleteText={'Удалить номер'}
      />
    </Flex>
  )
}
