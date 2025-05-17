'use client';
import React from 'react';
import styles from './style.module.css';
import { AuthProps, useLogin } from '@/shared/api/auth/auth';
import { Controller, useForm } from 'react-hook-form';
import { Grid, GridItem } from '@consta/uikit/Grid';
import { FORM_SIZE } from '@/shared/lib/const';
import { TextField } from '@consta/uikit/TextField';
import { Button } from '@consta/uikit/Button';

export interface LoginProps {
    children?: React.ReactNode;
    className?: string;
}

export const Login = ({ className }: LoginProps) => {
    const { mutateAsync } = useLogin();

    const {
        control,
        watch,
        formState: { errors },
    } = useForm<AuthProps>({
        defaultValues: { email: undefined, password: undefined },
    });

    const formData = watch();

    return (
        <div>
            <Grid cols={6} gap={FORM_SIZE}>
                <GridItem col={6}>
                    <Controller
                        name="email"
                        control={control}
                        rules={{ required: true }}
                        render={({ field }) => <TextField {...field} autoComplete={'off'} placeholder={'Введите почту'} label={'Почта'} required size={FORM_SIZE} className={styles.fields} />}
                    />
                </GridItem>
                <GridItem col={6}>
                    <Controller
                        name="password"
                        control={control}
                        render={({ field }) => <TextField {...field} placeholder="Введите пароль" label="Пароль" type="password" required min={1} max={5} size={FORM_SIZE} className={styles.fields} />}
                    />
                </GridItem>
                <GridItem col={2}>
                    <Button
                        label={'Войти'}
                        onClick={async () => {
                            await mutateAsync({
                                email: formData.email,
                                password: formData.password,
                            });
                        }}
                    />
                </GridItem>
            </Grid>
        </div>
    );
};
