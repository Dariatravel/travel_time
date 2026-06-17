import { createSupabaseServerClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { UserRole } from '@/shared/api/auth/auth';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

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

export async function requireAdmin(request: NextRequest) {
    const {
        data: { user },
        error,
    } = await getAuthenticatedUser(request);

    if (error || !user) {
        return { error: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }) };
    }

    if (user.user_metadata?.role !== UserRole.ADMIN) {
        return { error: NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 }) };
    }

    return { user };
}
