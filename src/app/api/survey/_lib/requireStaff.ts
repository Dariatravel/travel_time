import {
    createSupabaseServerClient,
    createSupabaseServiceRoleClient,
} from '@/app/api/yandex-backend/_lib/supabaseServer';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export const STAFF_ROLES = ['admin', 'operator'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

const getAuthenticatedUser = async (request: NextRequest) => {
    const authorization = request.headers.get('authorization');

    if (authorization) {
        const supabase = createSupabaseServerClient(authorization);
        return supabase.auth.getUser();
    }

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll() {
                    // read-only session check in API route
                },
            },
        },
    );

    return supabase.auth.getUser();
};

/**
 * Опрос доступен админам и операторам (роль — из public.user_roles,
 * как в requireAdmin). Возвращает пользователя и его роль либо готовый
 * ответ с ошибкой.
 */
export async function requireStaff(request: NextRequest, roles: readonly string[] = STAFF_ROLES) {
    const {
        data: { user },
        error,
    } = await getAuthenticatedUser(request);

    if (error || !user) {
        return { error: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }) };
    }

    const serviceClient = createSupabaseServiceRoleClient();
    const { data: roleRow, error: roleError } = await serviceClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

    if (roleError) {
        return {
            error: NextResponse.json({ error: 'Не удалось проверить права' }, { status: 502 }),
        };
    }

    const role = roleRow?.role as string | undefined;
    if (!role || !roles.includes(role)) {
        return { error: NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 }) };
    }

    return { user, role: role as StaffRole };
}
