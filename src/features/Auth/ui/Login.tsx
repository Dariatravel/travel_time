'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthProps, useLogin } from '@/shared/api/auth/auth';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import styles from './style.module.css';

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
        <div className="space-y-4 ">
            <div className="space-y-2">
                <Label htmlFor="email">Почта</Label>
                <Controller
                    name="email"
                    control={control}
                    rules={{ required: 'Email обязателен для заполнения' }}
                    render={({ field, fieldState: { error } }) => (
                        <div>
                            <Input
                                {...field}
                                id="email"
                                type="email"
                                autoComplete="off"
                                placeholder="Введите почту"
                                className={styles.fields}
                            />
                            {error && <p className="text-sm text-red-600 mt-1">{error.message}</p>}
                        </div>
                    )}
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Controller
                    name="password"
                    control={control}
                    rules={{ required: 'Пароль обязателен для заполнения' }}
                    render={({ field, fieldState: { error } }) => (
                        <div>
                            <Input
                                {...field}
                                id="password"
                                type="password"
                                placeholder="Введите пароль"
                                className={styles.fields}
                            />
                            {error && <p className="text-sm text-red-600 mt-1">{error.message}</p>}
                        </div>
                    )}
                />
            </div>

            <Button
                className="w-full"
                onClick={async () => {
                    await mutateAsync({
                        email: formData.email,
                        password: formData.password,
                    });
                }}
            >
                Войти
            </Button>
        </div>
    );
};
