import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

import { requireStaff, STAFF_ROLES } from '../_lib/requireStaff';

export const dynamic = 'force-dynamic';

export type SurveyParticipant = {
    id: string;
    name: string;
    role: string;
    email: string | null;
};

/** Участники опроса — все админы и операторы. Только для страницы статистики (админ). */
export async function GET(request: NextRequest) {
    const auth = await requireStaff(request, ['admin']);
    if ('error' in auth && auth.error) {
        return auth.error;
    }

    try {
        const supabaseAdmin = createSupabaseServiceRoleClient();
        const [{ data: users, error: usersError }, { data: roleRows, error: rolesError }] =
            await Promise.all([
                supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
                supabaseAdmin
                    .from('user_roles')
                    .select('user_id, role')
                    .in('role', [...STAFF_ROLES]),
            ]);

        if (usersError) {
            return NextResponse.json({ error: usersError.message }, { status: 500 });
        }
        if (rolesError) {
            return NextResponse.json({ error: rolesError.message }, { status: 500 });
        }

        const roleById = new Map(
            (roleRows ?? []).map((row) => [row.user_id as string, row.role as string]),
        );
        const participants: SurveyParticipant[] = (users.users ?? [])
            .filter((user) => roleById.has(user.id))
            .map((user) => ({
                id: user.id,
                name:
                    [user.user_metadata?.name, user.user_metadata?.surname]
                        .filter(Boolean)
                        .join(' ')
                        .trim() ||
                    user.email ||
                    user.id,
                role: roleById.get(user.id) ?? '',
                email: user.email ?? null,
            }))
            .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name, 'ru'));

        return NextResponse.json({ participants });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
