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
import { RegisterProps, useRegister, UserRole } from '@/shared/api/auth/auth';
import { translateUserRole } from '@/shared/lib/translateUser';
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import styles from './style.module.css';

export interface LoginProps {
    children?: React.ReactNode;
    className?: string;
}

export const Register = ({ className }: LoginProps) => {
    const { isPending, mutateAsync } = useRegister();

    const {
        control,
        watch,
        formState: { errors },
    } = useForm<RegisterProps>();

    const formData = watch();

    return (
        <>
            {isPending && <FullWidthLoader />}
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="surname">Фамилия</Label>
                        <Controller
                            name="surname"
                            control={control}
                            rules={{ required: 'Фамилия обязательна для заполнения' }}
                            render={({ field, fieldState: { error } }) => (
                                <div>
                                    <Input
                                        {...field}
                                        id="surname"
                                        placeholder="Введите фамилию"
                                        className={styles.fields}
                                    />
                                    {error && (
                                        <p className="text-sm text-red-600 mt-1">{error.message}</p>
                                    )}
                                </div>
                            )}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="name">Имя</Label>
                        <Controller
                            name="name"
                            control={control}
                            rules={{ required: 'Имя обязательно для заполнения' }}
                            render={({ field, fieldState: { error } }) => (
                                <div>
                                    <Input
                                        {...field}
                                        id="name"
                                        placeholder="Введите имя"
                                        className={styles.fields}
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
                    <Label htmlFor="role">Тип пользователя</Label>
                    <Controller
                        name="role"
                        control={control}
                        rules={{ required: 'Роль обязательна для выбора' }}
                        render={({ field, fieldState: { error } }) => (
                            <div>
                                <Select
                                    onValueChange={(value) =>
                                        field.onChange({
                                            id: value,
                                            label: translateUserRole(value as UserRole),
                                        })
                                    }
                                >
                                    <SelectTrigger className={styles.fields}>
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
                        <Label htmlFor="phone">Телефон</Label>
                        <Controller
                            name="phone"
                            control={control}
                            rules={{ required: 'Телефон обязателен для заполнения' }}
                            render={({ field, fieldState: { error } }) => (
                                <div>
                                    <Input
                                        {...field}
                                        id="phone"
                                        type="tel"
                                        placeholder="Введите номер телефона"
                                        className={styles.fields}
                                    />
                                    {error && (
                                        <p className="text-sm text-red-600 mt-1">{error.message}</p>
                                    )}
                                </div>
                            )}
                        />
                    </div>

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
                                        placeholder="Введите почту"
                                        className={styles.fields}
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
                                {error && (
                                    <p className="text-sm text-red-600 mt-1">{error.message}</p>
                                )}
                            </div>
                        )}
                    />
                </div>

                <Button
                    className="w-full"
                    onClick={async () => {
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-expect-error
                        await mutateAsync({ ...formData, role: formData?.role?.id });
                    }}
                >
                    Зарегистрироваться
                </Button>
            </div>
        </>
    );
};
