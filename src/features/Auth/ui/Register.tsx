'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { PhoneInput } from '@/shared';
import { RegisterProps, useRegister, UserRole } from '@/shared/api/auth/auth';
import { routes, PagesEnum } from '@/shared/config/routes';
import { translateUserRole } from '@/shared/lib/translateUser';
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import { useRouter } from 'next/navigation';
import React from 'react';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import styles from './style.module.css';

export interface LoginProps {
    children?: React.ReactNode;
    className?: string;
}

// Тип для формы регистрации (с объектом для роли)
interface RegisterFormData extends Omit<RegisterProps, 'role'> {
    role: { id: string; label: string };
}

// Компонент для отображения обязательного поля
const RequiredLabel = ({ children }: { children: React.ReactNode }) => (
    <span>
        {children} <span className="text-red-600">*</span>
    </span>
);

// Правила валидации
const validationRules = {
    surname: {
        required: 'Фамилия обязательна',
        minLength: { value: 2, message: 'Фамилия должна содержать минимум 2 символа' },
        pattern: {
            value: /^[а-яА-ЯёЁa-zA-Z\s-]+$/,
            message: 'Фамилия может содержать только буквы, пробелы и дефисы',
        },
    },
    name: {
        required: 'Имя обязательно',
        minLength: { value: 2, message: 'Имя должно содержать минимум 2 символа' },
    },
    role: {
        required: 'Роль обязательна для выбора',
    },
    phone: {
        required: 'Номер телефона обязателен',
        pattern: {
            value: /^\+7\(\d{3}\)\d{3}-\d{2}-\d{2}$/,
            message: 'Введите корректный номер телефона',
        },
    },
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
        pattern: {
            value: /^(?=.*[a-zA-Z])(?=.*\d).+$/,
            message: 'Пароль должен содержать буквы и цифры',
        },
    },
};

export const Register = () => {
    const router = useRouter();
    const { isPending, mutateAsync } = useRegister();

    const form = useForm<RegisterFormData>({
        mode: 'onChange', // Валидация при изменении
    });

    const { control, handleSubmit } = form;

    const onSubmit = async (data: RegisterFormData) => {
        try {
            await mutateAsync({ ...data, role: data.role.id });
            // После успешной регистрации перенаправляем на главную страницу
            router.push(routes[PagesEnum.MAIN]);
        } catch (error) {
            console.error('Ошибка регистрации:', error);
        }
    };

    return (
        <FormProvider {...form}>
            {isPending && <FullWidthLoader />}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="surname">
                            <RequiredLabel>Фамилия</RequiredLabel>
                        </Label>
                        <Controller
                            name="surname"
                            control={control}
                            rules={validationRules.surname}
                            render={({ field, fieldState: { error } }) => (
                                <div>
                                    <Input
                                        {...field}
                                        id="surname"
                                        placeholder="Введите фамилию"
                                        className={styles.fields}
                                        aria-invalid={!!error}
                                    />
                                    {error && (
                                        <p className="text-sm text-red-600 mt-1">{error.message}</p>
                                    )}
                                </div>
                            )}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="name">
                            <RequiredLabel>Имя</RequiredLabel>
                        </Label>
                        <Controller
                            name="name"
                            control={control}
                            rules={validationRules.name}
                            render={({ field, fieldState: { error } }) => (
                                <div>
                                    <Input
                                        {...field}
                                        id="name"
                                        placeholder="Введите имя"
                                        className={styles.fields}
                                        aria-invalid={!!error}
                                    />
                                    {error && (
                                        <p className="text-sm text-red-600 mt-1">{error.message}</p>
                                    )}
                                </div>
                            )}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="role">
                        <RequiredLabel>Тип пользователя</RequiredLabel>
                    </Label>
                    <Controller
                        name="role"
                        control={control}
                        rules={validationRules.role}
                        render={({ field, fieldState: { error } }) => (
                            <div>
                                <Select
                                    onValueChange={(value) =>
                                        field.onChange({
                                            id: value,
                                            label: translateUserRole(value as UserRole),
                                        })
                                    }
                                    value={field.value?.id || ''}
                                >
                                    <SelectTrigger className={styles.fields} aria-invalid={!!error}>
                                        <SelectValue placeholder="Выберите роль" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={UserRole.OPERATOR}>
                                            {translateUserRole(UserRole.OPERATOR)}
                                        </SelectItem>
                                        <SelectItem value={UserRole.HOTEL}>
                                            {translateUserRole(UserRole.HOTEL)}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                {error && (
                                    <p className="text-sm text-red-600 mt-1">{error.message}</p>
                                )}
                            </div>
                        )}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <PhoneInput
                            control={control}
                            name="phone"
                            placeholder="+7 (___) ___-__-__"
                            required
                            label="Номер телефона"
                            className={styles.fields}
                        />
                    </div>

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
                                        placeholder="example@mail.ru"
                                        className={styles.fields}
                                        aria-invalid={!!error}
                                    />
                                    {error && (
                                        <p className="text-sm text-red-600 mt-1">{error.message}</p>
                                    )}
                                </div>
                            )}
                        />
                    </div>
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
                                    placeholder="Минимум 6 символов (буквы и цифры)"
                                    className={styles.fields}
                                    aria-invalid={!!error}
                                />
                                {error && (
                                    <p className="text-sm text-red-600 mt-1">{error.message}</p>
                                )}
                            </div>
                        )}
                    />
                </div>

                <div className="pt-2">
                    <p className="text-sm text-gray-600 mb-3">
                        <span className="text-red-600">*</span> — обязательные поля
                    </p>
                    <Button type="submit" className="w-full" disabled={isPending}>
                        {isPending ? 'Регистрация...' : 'Зарегистрироваться'}
                    </Button>
                </div>
            </form>
        </FormProvider>
    );
};
