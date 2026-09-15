import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '../_lib/requireAdmin';

export const dynamic = 'force-dynamic';

/**
 * Доступ отельера к своему отелю (16.09.2026).
 *
 * Раньше отельер мог только сам зарегистрироваться на странице входа, а
 * менеджер потом привязывал его к отелю через выпадающий список в форме
 * отеля. Здесь оба шага в один: admin создаёт вход отельеру и сразу
 * привязывает к отелю (hotels.user_id). Роль hotel ставится явно — так же
 * её выставляет триггер на новых пользователей.
 *
 * Пароль показывается менеджеру один раз, отельеру его передают лично.
 */

const schema = z.object({
    email: z.string().email('Введите корректный email'),
    password: z
        .string()
        .min(8, 'Пароль — минимум 8 символов')
        .regex(/^(?=.*[a-zA-Z])(?=.*\d).+$/, 'Пароль должен содержать буквы и цифры'),
    name: z.string().trim().min(2, 'Имя — минимум 2 символа').max(120),
    phone: z.string().trim().max(40).optional().default(''),
    hotel_id: z.string().uuid('Не указан отель'),
});

export async function POST(request: NextRequest) {
    const auth = await requireAdmin(request);
    if ('error' in auth && auth.error) {
        return auth.error;
    }

    try {
        const parsed = schema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.errors[0]?.message ?? 'Неверные данные' },
                { status: 400 },
            );
        }
        const { email, password, name, phone, hotel_id } = parsed.data;
        const service = createSupabaseServiceRoleClient();

        const { data: hotel, error: hotelError } = await service
            .from('hotels')
            .select('id, title, user_id')
            .eq('id', hotel_id)
            .maybeSingle();
        if (hotelError) return NextResponse.json({ error: hotelError.message }, { status: 502 });
        if (!hotel) return NextResponse.json({ error: 'Отель не найден' }, { status: 404 });

        const { data, error } = await service.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            // surname у отельеров — название отеля: так их показывает список назначения.
            user_metadata: { name, surname: hotel.title, phone },
        });
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        const { error: roleError } = await service
            .from('user_roles')
            .upsert({ user_id: data.user.id, role: 'hotel' });
        if (roleError) {
            await service.auth.admin.deleteUser(data.user.id);

            return NextResponse.json({ error: `Не удалось назначить роль: ${roleError.message}` }, { status: 500 });
        }

        const { error: linkError } = await service.from('hotels').update({ user_id: data.user.id }).eq('id', hotel_id);
        if (linkError) {
            await service.auth.admin.deleteUser(data.user.id);

            return NextResponse.json({ error: `Не удалось привязать к отелю: ${linkError.message}` }, { status: 500 });
        }

        return NextResponse.json({
            hotelier: { id: data.user.id, email: data.user.email, name, hotel_id, previous_user_id: hotel.user_id },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Неизвестная ошибка';

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
