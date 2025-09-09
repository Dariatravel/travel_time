import { z } from 'zod';

const imageSchema = z.object({
    id: z.string(),
    file: z.instanceof(File),
});

export const hotelFormSchema = z.object({
    id: z.string().optional(),
    title: z
        .string({ message: 'Название отеля обязательно для заполнения' })
        .min(1, { message: 'Название отеля обязательно для заполнения' })
        .nonempty({ message: 'Название отеля обязательно для заполнения' }),
    type: z.object(
        {
            id: z.string(),
            label: z.string(),
        },
        { message: 'Тип отеля обязателен для заполнения' },
    ),
    user_id: z.object(
        {
            id: z.string(),
            label: z.string(),
        },
        { message: 'Отельер обязателен для заполнения' },
    ),
    address: z.string({ message: 'Адрес обязателен для заполнения' }),
    city: z.object({
        id: z.string(),
        label: z.string(),
    }),
    phone: z.string().min(1, 'Номер телефона обязателен для заполнения'),
    telegram_url: z.string().optional(),
    description: z.string().optional(),
    image_id: imageSchema.nullable().optional(),
    beach: z.object(
        {
            id: z.string(),
            label: z.string(),
        },
        { message: 'Пляж обязателен для заполнения' },
    ),
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
