import { z } from 'zod';

const imageSchema = z.object({
    id: z.string(),
    file: z.instanceof(File),
});

export const hotelFormSchema = z.object({
    id: z.string().optional(),
    title: z
        .string({ message: 'Название отеля обязательно' })
        .min(1, { message: 'Название отеля обязательно' })
        .nonempty({ message: 'Название отеля обязательно' }),
    type: z.object(
        {
            id: z.string(),
            label: z.string(),
        },
        { message: 'Тип отеля обязателен' },
    ),
    user_id: z.object(
        {
            id: z.string(),
            label: z.string(),
        },
        { message: 'Отельер обязателен' },
    ),
    address: z.string({ message: 'Адрес обязателен' }),
    rating: z.string().optional(),
    city: z
        .object(
            {
                id: z.string(),
                label: z.string(),
            },
            { message: 'Город обязателен' },
        )
        .optional(),
    phone: z
        .string({ message: 'Номер телефона обязателен для заполнения' })
        .min(1, 'Номер телефона обязателен для заполнения')
        .regex(/^\+7\(\d{3}\)\d{3}-\d{2}-\d{2}$/, 'Введите корректный номер телефона'),
    telegram_url: z.string().optional(),
    description: z.string().optional(),
    image_id: imageSchema.nullable().optional(),
    beach: z
        .object(
            {
                id: z.string(),
                label: z.string(),
            },
            { message: 'Пляж обязателен' },
        )
        .optional(),
    beach_distance: z
        .object({
            id: z.string(),
            label: z.string(),
        })
        .optional(),
    features: z
        .array(
            z.object({
                id: z.string(),
                label: z.string(),
            }),
        )
        .default([]),
    eat: z
        .array(
            z.object({
                id: z.string(),
                label: z.string(),
            }),
        )
        .default([]),
});

export type HotelFormSchema = z.infer<typeof hotelFormSchema>;
