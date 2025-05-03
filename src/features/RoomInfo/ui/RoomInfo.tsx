import React, { FC, useMemo } from 'react'
import cx from './style.module.css'
import { TextField } from '@consta/uikit/TextField'
import { Select } from '@consta/uikit/Select'
import { Controller, useForm } from 'react-hook-form'
import { FormButtons } from '@/shared/ui/FormButtons/FormButtons'
import { RoomForm, useGetHotelsForRoom } from '@/shared/api/hotel/hotel'
import { FormTitle } from '@/shared/ui/FormTitle/FormTitle'
import { FORM_GAP_SIZE, FORM_SIZE } from '@/shared/lib/const'
import { Grid, GridItem } from '@consta/uikit/Grid'
import { DragNDropField } from '@consta/uikit/DragNDropField'
import { Button } from '@consta/uikit/Button'
import { Text } from '@consta/uikit/Text'
import { adaptToOption } from '@/shared/lib/adaptHotel'
import { CurrentReserveType, Nullable } from '@/shared/api/reserve/reserve'
import { Room, RoomDTO } from '@/shared/api/room/room'

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

  const { control, watch } = useForm<RoomForm>({
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

  const onAcceptForm = () => {
    const data = deserializeData(formData)

    console.log(data)
    onAccept(data)
  }

  return (
    <>
      <FormTitle>
        {isEdit ? 'Редактирование номера' : 'Добавление номера'}
      </FormTitle>
      <Controller
        name="hotel_id"
        control={control}
        rules={{ required: true }}
        render={({ field }) => (
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
          />
        )}
      />

      <Controller
        name="title"
        control={control}
        rules={{ required: true }}
        render={({ field }) => (
          <TextField
            {...field}
            placeholder="Введите название"
            label="Название номера"
            required
            size={FORM_SIZE}
            className={cx.fields}
            disabled={loading}
          />
        )}
      />

      <Grid cols={3} gap={FORM_GAP_SIZE}>
        <GridItem col={2}>
          <Controller
            name="price"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
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
              />
            )}
          />
        </GridItem>
        <GridItem>
          <Controller
            name="quantity"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
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
              />
            )}
          />
        </GridItem>
      </Grid>
      <DragNDropField
        onDropFiles={files => console.log(files)}
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
            className={cx.fields}
            disabled={loading}
          />
        )}
      />

      <FormButtons
        isLoading={loading}
        onAccept={onAcceptForm}
        onClose={onClose}
        isEdit={isEdit}
        onDelete={() =>
          currentReserve?.room?.id && onDelete(currentReserve?.room?.id)
        }
        deleteText={'Удалить номер'}
      />
    </>
  )
}
