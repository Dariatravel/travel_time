import { NextRequest, NextResponse } from 'next/server';

import { dispatchMirrorCron } from '@/app/api/mirror/_lib/dispatchCron';
import { MIRROR_SOURCES } from '@/app/api/mirror/_lib/mirrorSources';
import { syncMirrorForHotel } from '@/app/api/mirror/_lib/syncMirror';
import {
    createSupabaseServerClient,
    createSupabaseServiceRoleClient,
} from '@/app/api/yandex-backend/_lib/supabaseServer';

export const dynamic = 'force-dynamic';

// Порог свежести: если зеркало обновлялось недавно — не дёргаем источник зря.
const STALE_AFTER_MS = 10 * 60 * 1000;

const SHELTER_TAG = 'mirror_shelter';

// Автоподтяжка голубых шахматок при подборе. Вызывается из формы поиска
// fire-and-forget, когда подбор затрагивает голубые отели. Протухшие
// (старше 10 минут) источники обновляются: Google-таблицы — сразу здесь
// (быстрые), медленные Shelter — запуском фонового крона. Поиск НЕ ждёт
// результата: текущий подбор идёт по последним сохранённым данным, свежие
// лягут к следующему запросу.
export async function POST(request: NextRequest) {
    const authorization = request.headers.get('authorization');
    if (!authorization) {
        return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
    }

    try {
        const userClient = createSupabaseServerClient(authorization);
        const {
            data: { user },
        } = await userClient.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 });
        }

        const supabase = createSupabaseServiceRoleClient();

        // Свежесть по каждому источнику — одним запросом (по тегам меток).
        const tags = new Set<string>([SHELTER_TAG]);
        for (const source of Object.values(MIRROR_SOURCES)) {
            if (source.system !== 'shelter') tags.add(source.tag);
        }
        const { data: rows, error } = await supabase
            .from('reserves')
            .select('external_source, external_synced_at')
            .in('external_source', [...tags]);
        if (error) {
            throw new Error(error.message);
        }
        const lastByTag = new Map<string, number>();
        for (const row of rows ?? []) {
            const tag = row.external_source as string;
            const at = row.external_synced_at ? Date.parse(row.external_synced_at) : 0;
            if (at > (lastByTag.get(tag) ?? 0)) lastByTag.set(tag, at);
        }
        const isStale = (tag: string) => Date.now() - (lastByTag.get(tag) ?? 0) > STALE_AFTER_MS;

        const refreshed: string[] = [];
        let cronDispatched = false;

        // Google-таблицы и iCal — быстрые, обновляем прямо здесь (по отелям).
        for (const [hotelId, source] of Object.entries(MIRROR_SOURCES)) {
            if (source.system === 'shelter' || !isStale(source.tag)) continue;
            try {
                await syncMirrorForHotel(supabase, hotelId);
                refreshed.push(source.tag);
            } catch {
                // Сбой одного источника не мешает остальным и самому поиску.
            }
        }

        // Медленные Shelter (asyncCron) — один запуск фонового крона на всех.
        const shelterStale = Object.values(MIRROR_SOURCES).some(
            (source) => source.system === 'shelter' && source.asyncCron && isStale(SHELTER_TAG),
        );
        if (shelterStale) {
            try {
                await dispatchMirrorCron();
                cronDispatched = true;
            } catch {
                // Нет токена/сбой — не критично: крон и так идёт по расписанию.
            }
        }

        return NextResponse.json({ result: { refreshed, cronDispatched } });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось обновить зеркала';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
