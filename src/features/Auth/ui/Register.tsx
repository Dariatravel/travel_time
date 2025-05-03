'use client'
import React from 'react'
import styles from './style.module.css'
import { RegisterProps, useRegister, UserRole } from '@/shared/api/auth/auth'
import { Controller, useForm } from 'react-hook-form'
import { Grid, GridItem } from '@consta/uikit/Grid'
import { FORM_SIZE } from '@/shared/lib/const'
import { TextField } from '@consta/uikit/TextField'
import { Button } from '@consta/uikit/Button'
import { Select } from '@consta/uikit/Select'
import { FullWidthLoader } from '@/shared/ui/Loader/Loader'
import { translateUserRole } from '@/shared/lib/translateUser'

export interface LoginProps {
  children?: React.ReactNode
  className?: string
}

export const Register = ({ className }: LoginProps) => {
  const { isPending, mutateAsync } = useRegister()

  const {
    control,
    watch,
    formState: { errors },
  } = useForm<RegisterProps>()

  const formData = watch()

  return (
    <>
      {isPending && <FullWidthLoader />}
      <Grid cols={6} gap={FORM_SIZE}>
        <GridItem col={6}>
          <Controller
            name="surname"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <TextField
                {...field}
                placeholder={'Введите фамилию'}
                label={'Фамилия'}
                required
                size={FORM_SIZE}
                className={styles.fields}
              />
            )}
          />
        </GridItem>
        <GridItem col={6}>
          <Controller
            name="name"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <TextField
                {...field}
                placeholder={'Введите имя'}
                label={'Имя'}
                required
                size={FORM_SIZE}
                className={styles.fields}
              />
            )}
          />
        </GridItem>
        <GridItem col={6}>
          <Controller
            name="role"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <Select
                items={[
                  {
                    label: translateUserRole(UserRole.ADMIN),
                    id: UserRole.ADMIN,
                  },
                  {
                    label: translateUserRole(UserRole.OPERATOR),
                    id: UserRole.OPERATOR,
                  },
                  {
                    label: translateUserRole(UserRole.HOTEL),
                    id: UserRole.HOTEL,
                  },
                ]}
                {...field}
                placeholder={'Выберите роль'}
                label={'Тип'}
                required
                size={FORM_SIZE}
                className={styles.fields}
              />
            )}
          />
        </GridItem>
        <GridItem col={6}>
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                placeholder="Введите номер телефона"
                label="Телефон"
                type="phone"
                required
                min={1}
                max={5}
                size={FORM_SIZE}
                className={styles.fields}
              />
            )}
          />
        </GridItem>
        <GridItem col={6}>
          <Controller
            name="email"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                placeholder="Введите почту"
                label="Почта"
                type="email"
                required
                min={1}
                max={5}
                size={FORM_SIZE}
                className={styles.fields}
              />
            )}
          />
        </GridItem>
        <GridItem col={6}>
          <Controller
            name="password"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <TextField
                {...field}
                placeholder={'Введите пароль'}
                label={'Пароль'}
                type="password"
                required
                size={FORM_SIZE}
                className={styles.fields}
              />
            )}
          />
        </GridItem>
        <GridItem col={3}>
          <Button
            label={'Зарегистрироваться'}
            onClick={async () => {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-expect-error
              mutateAsync({ ...formData, role: formData?.role?.id })
            }}
          />
        </GridItem>
      </Grid>
    </>
  )
}
