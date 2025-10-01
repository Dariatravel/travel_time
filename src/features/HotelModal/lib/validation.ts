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
    city: z
        .object(
            {
                id: z.string(),
                label: z.string(),
            },
            { message: 'Город обязателен' },
        )
        .optional(),
    phone: z.string().min(1, 'Номер телефона обязателен'),
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
    features: z.array(
        z
            .object({
                id: z.string(),
                label: z.string(),
            })
            .optional(),
    ),
    eat: z.array(
        z
            .object({
                id: z.string(),
                label: z.string(),
            })
            .optional(),
    ),
});

export type HotelFormSchema = z.infer<typeof hotelFormSchema>;
