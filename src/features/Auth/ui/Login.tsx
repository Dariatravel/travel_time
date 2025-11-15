'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthProps, useLogin } from '@/shared/api/auth/auth';
import { routes, PagesEnum } from '@/shared/config/routes';
import { useRouter } from 'next/navigation';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import styles from './style.module.css';

export interface LoginProps {
    children?: React.ReactNode;
    className?: string;
}

// Компонент для отображения обязательного поля
const RequiredLabel = ({ children }: { children: React.ReactNode }) => (
    <span>
        {children} <span className="text-red-600">*</span>
    </span>
);

// Правила валидации
const validationRules = {
    email: {
        required: 'Email обязателен',
        pattern: {
            value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
            message: 'Введите корректный email адрес',
        },
    },
    password: {
        required: 'Пароль обязателен',
        minLength: { value: 6, message: 'Пароль должен содержать минимум 6 символов' },
    },
};

export const Login = () => {
    const router = useRouter();
    const { mutateAsync, isPending } = useLogin();

    const { control, handleSubmit } = useForm<AuthProps>({
        defaultValues: { email: undefined, password: undefined },
        mode: 'onChange',
    });

    const onSubmit = async (data: AuthProps) => {
        try {
            await mutateAsync(data);
            // После успешного входа перенаправляем на главную страницу
            router.push(routes[PagesEnum.MAIN]);
        } catch (error) {
            console.error('Ошибка входа:', error);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="email">
                    <RequiredLabel>Email</RequiredLabel>
                </Label>
                <Controller
                    name="email"
                    control={control}
                    rules={validationRules.email}
                    render={({ field, fieldState: { error } }) => (
                        <div>
                            <Input
                                {...field}
                                id="email"
                                type="email"
                                autoComplete="off"
                                placeholder="example@mail.ru"
                                className={styles.fields}
                                aria-invalid={!!error}
                            />
                            {error && <p className="text-sm text-red-600 mt-1">{error.message}</p>}
                        </div>
                    )}
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="password">
                    <RequiredLabel>Пароль</RequiredLabel>
                </Label>
                <Controller
                    name="password"
                    control={control}
                    rules={validationRules.password}
                    render={({ field, fieldState: { error } }) => (
                        <div>
                            <Input
                                {...field}
                                id="password"
                                type="password"
                                placeholder="Введите пароль"
                                className={styles.fields}
                                aria-invalid={!!error}
                            />
                            {error && <p className="text-sm text-red-600 mt-1">{error.message}</p>}
                        </div>
                    )}
                />
            </div>

            <div className="space-y-3">
                <p className="text-sm text-gray-600">
                    <span className="text-red-600">*</span> — обязательные поля
                </p>
                <Button type="submit" className="w-full" disabled={isPending}>
                    {isPending ? 'Вход...' : 'Войти'}
                </Button>
            </div>
        </form>
    );
};
