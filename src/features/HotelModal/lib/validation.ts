import { z } from 'zod';

const imageSchema = z.object({
    id: z.string(),
    file: z.instanceof(File),
});

export const hotelFormSchema = z.object({
    id: z.string().optional(),
    title: z
        .string()
        .min(1, { message: 'Название отеля обязательно для заполнения' })
        .nonempty({ message: 'Название отеля обязательно для заполнения' }),
    type: z.object({
        id: z.string(),
        label: z.string(),
    }),
    rating: z.string().refine((val) => {
        const num = Number(val);
        return !isNaN(num) && num >= 1 && num <= 5;
    }, 'Рейтинг должен быть от 1 до 5'),
    user_id: z.object({
        id: z.string(),
        label: z.string(),
    }),
    address: z.string().min(1, 'Адрес обязателен для заполнения'),
    city: z.string().min(1, 'Город обязателен для заполнения'),
    phone: z.string().min(1, 'Номер телефона обязателен для заполнения'),
    telegram_url: z.string().optional(),
    description: z.string().optional().default(''),
    image_id: imageSchema.nullable().optional(),
    beach: z.object({
        id: z.string(),
        label: z.string(),
    }),
    beach_distance: z.object({
        id: z.string(),
        label: z.string(),
    }),
    features: z.object({
        id: z.string(),
        label: z.string(),
    }),
    eat: z.object({
        id: z.string(),
        label: z.string(),
    }),
});

export type HotelFormSchema = z.infer<typeof hotelFormSchema>;
