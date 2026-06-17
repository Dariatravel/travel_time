'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/shared';
import { CreateOperatorPayload, useCreateOperator } from '@/shared/api/admin/operators';
import { Controller, FormProvider, useForm } from 'react-hook-form';

import styles from '@/features/Auth/ui/style.module.css';

const RequiredLabel = ({ children }: { children: React.ReactNode }) => (
    <span>
        {children} <span className="text-red-600">*</span>
    </span>
);

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
    phone: {
        required: 'Номер телефона обязателен',
        pattern: {
            value: /^(\+7\(\d{3}\)\d{3}-\d{2}-\d{2}|\+\d{7,15})$/,
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

type CreateOperatorFormProps = {
    onSuccess?: () => void;
};

export const CreateOperatorForm = ({ onSuccess }: CreateOperatorFormProps) => {
    const { mutateAsync, isPending } = useCreateOperator();
    const form = useForm<CreateOperatorPayload>({ mode: 'onChange' });
    const { control, handleSubmit, reset } = form;

    const onSubmit = async (data: CreateOperatorPayload) => {
        await mutateAsync(data);
        reset();
        onSuccess?.();
    };

    return (
        <FormProvider {...form}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="operator-surname">
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
                                        id="operator-surname"
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
                        <Label htmlFor="operator-name">
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
                                        id="operator-name"
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
                        <Label htmlFor="operator-email">
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
                                        id="operator-email"
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
                    <Label htmlFor="operator-password">
                        <RequiredLabel>Временный пароль</RequiredLabel>
                    </Label>
                    <Controller
                        name="password"
                        control={control}
                        rules={validationRules.password}
                        render={({ field, fieldState: { error } }) => (
                            <div>
                                <Input
                                    {...field}
                                    id="operator-password"
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

                <Button type="submit" disabled={isPending}>
                    {isPending ? 'Создание...' : 'Создать оператора'}
                </Button>
            </form>
        </FormProvider>
    );
};
