import { NextRequest, NextResponse } from 'next/server';

import { syncMirrorForHotel } from '@/app/api/mirror/_lib/syncMirror';
import {
    createSupabaseServerClient,
    createSupabaseServiceRoleClient,
} from '@/app/api/yandex-backend/_lib/supabaseServer';

export const dynamic = 'force-dynamic';

// Кнопка «Обновить занятость» в голубой шахматке. Требует авторизации
// (передаётся токен сессии оператора). dryRun=true — только предпросмотр.
export async function POST(request: NextRequest) {
    const authorization = request.headers.get('authorization');
    if (!authorization) {
        return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
    }

    try {
        // Проверяем, что вызывает залогиненный пользователь.
        const userClient = createSupabaseServerClient(authorization);
        const {
            data: { user },
        } = await userClient.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 });
        }

        const body = (await request.json()) as { hotelId?: string; dryRun?: boolean };
        if (!body?.hotelId) {
            return NextResponse.json({ error: 'hotelId обязателен' }, { status: 400 });
        }

        // Записи делает сервис-роль — надёжно и без зависимости от RLS.
        const supabase = createSupabaseServiceRoleClient();
        const result = await syncMirrorForHotel(supabase, body.hotelId, {
            dryRun: body.dryRun === true,
        });

        return NextResponse.json({ result });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Не удалось обновить занятость';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
