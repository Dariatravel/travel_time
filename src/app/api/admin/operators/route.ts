import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { UserRole } from '@/shared/api/auth/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '../_lib/requireAdmin';

export const dynamic = 'force-dynamic';

const createOperatorSchema = z.object({
    email: z.string().email('Введите корректный email'),
    password: z
        .string()
        .min(6, 'Пароль должен содержать минимум 6 символов')
        .regex(/^(?=.*[a-zA-Z])(?=.*\d).+$/, 'Пароль должен содержать буквы и цифры'),
    name: z.string().min(2, 'Имя должно содержать минимум 2 символа'),
    surname: z.string().min(2, 'Фамилия должна содержать минимум 2 символа'),
    phone: z
        .string()
        .regex(
            /^(\+7\(\d{3}\)\d{3}-\d{2}-\d{2}|\+\d{7,15})$/,
            'Введите корректный номер телефона',
        ),
});

export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if ('error' in auth && auth.error) {
        return auth.error;
    }

    try {
        const supabaseAdmin = createSupabaseServiceRoleClient();
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
        });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const operators = (data.users ?? [])
            .filter((user) => user.user_metadata?.role === UserRole.OPERATOR)
            .map((user) => ({
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name as string | undefined,
                surname: user.user_metadata?.surname as string | undefined,
                phone: user.user_metadata?.phone as string | undefined,
                createdAt: user.created_at,
            }))
            .sort((a, b) => (a.surname ?? '').localeCompare(b.surname ?? '', 'ru'));

        return NextResponse.json({ operators });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireAdmin(request);
    if ('error' in auth && auth.error) {
        return auth.error;
    }

    try {
        const body = await request.json();
        const parsed = createOperatorSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.errors[0]?.message ?? 'Invalid payload' },
                { status: 400 },
            );
        }

        const { email, password, name, surname, phone } = parsed.data;
        const supabaseAdmin = createSupabaseServiceRoleClient();

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                name,
                surname,
                phone,
                role: UserRole.OPERATOR,
            },
        });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({
            operator: {
                id: data.user.id,
                email: data.user.email,
                name,
                surname,
                phone,
                createdAt: data.user.created_at,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
