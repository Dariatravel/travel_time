import { z } from 'zod';
import { HOTEL_TYPES } from './const';

export const hotelFormSchema = z.object({
    id: z.string().optional(),
    title: z.string().min(1, 'Название отеля обязательно для заполнения'),
    type: z.object(
        {
            id: z.string(),
            label: z.string(),
        },
        { required_error: 'Тип отеля обязателен для выбора' },
    ),
    rating: z.string().refine(
        (val: string) => {
            const num = Number(val);
            return !isNaN(num) && num >= 1 && num <= 5;
        },
        { message: 'Рейтинг должен быть числом от 1 до 5' },
    ),
    address: z.string().min(1, 'Адрес обязателен для заполнения'),
    telegram_url: z
        .string()
        .url('Неверный формат URL')
        .refine((val: string) => val.startsWith('https://t.me/'), {
            message: 'URL должен начинаться с https://t.me/',
        })
        .optional(),
    phone: z.string().min(1, 'Номер телефона обязателен для заполнения'),
    user_id: z.object(
        {
            id: z.string(),
            label: z.string(),
        },
        { required_error: 'Отельер обязателен для выбора' },
    ),
    description: z.string().default(''),
    image_id: z
        .object({
            id: z.string(),
            file: z.instanceof(File),
        })
        .optional(),
});

export type HotelFormSchema = z.infer<typeof hotelFormSchema>;
