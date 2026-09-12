import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Очередь заданий в CRM ОКО — для отправителя на Mac mini.
 *
 * Токен ОКО лежит только на Mac mini, поэтому отправляет он: раз в минуту
 * забирает задания (GET) и отчитывается о результате (POST).
 * У ОКО лимит 5 запросов в минуту на весь аккаунт, поэтому за раз отдаём
 * не больше двух и в порядке важности: сообщение клиенту раньше остального.
 *
 * Задания выдаёт функция базы oko_outbox_claim: она же не даёт двум запускам
 * забрать одно задание (иначе клиент получил бы два одинаковых сообщения)
 * и помечает «зависшие» — те, по которым отправитель не отчитался.
 *
 * Доступ — общий секрет в заголовке X-Oko-Token (у Mac mini нет входа
 * пользователя). В адресе токен не передаём: он попадает в журналы шлюза.
 */

const MAX_BATCH = 2;

const authorized = (request: NextRequest): boolean => {
    const token = process.env.OKO_OUTBOX_TOKEN;
    const given = request.headers.get('x-oko-token') ?? '';
    if (!token) return false;
    const a = Buffer.from(token);
    const b = Buffer.from(given);

    return a.length === b.length && timingSafeEqual(a, b);
};

export async function GET(request: NextRequest) {
    if (!authorized(request)) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const service0 = createSupabaseServiceRoleClient();

    // peek=1 — только посмотреть очередь, не забирая задания: так сторож
    // видит, не встал ли отправитель, и ничего при этом не ломает.
    if (request.nextUrl.searchParams.get('peek')) {
        const { data, error, count } = await service0
            .from('oko_outbox')
            .select('created_at', { count: 'exact' })
            .in('status', ['pending', 'sending'])
            .order('created_at', { ascending: true })
            .limit(1);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const oldest = (data ?? [])[0] as { created_at?: string } | undefined;

        return NextResponse.json({
            ждут: count ?? 0,
            самое_старое_минут: oldest?.created_at
                ? Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / 60000)
                : null,
        });
    }

    const asked = Number(request.nextUrl.searchParams.get('limit') ?? MAX_BATCH);
    const limit = Math.max(1, Math.min(Number.isFinite(asked) ? asked : MAX_BATCH, MAX_BATCH));
    const service = service0;

    const { data, error } = await service.rpc('oko_outbox_claim', { p_limit: limit });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const jobs = ((data ?? []) as { id: string; kind: string; payload: unknown; attempts: number }[]).map((j) => ({
        id: j.id,
        kind: j.kind,
        payload: j.payload,
        attempts: j.attempts,
    }));

    return NextResponse.json({ jobs });
}

/**
 * Отчёт отправителя.
 *   ok: true               — отправлено;
 *   release: true          — задание не бралось в работу (сухой прогон),
 *                            вернуть в очередь, попытку не засчитывать;
 *   retry: true            — временная помеха (лимит, сеть), вернуть и засчитать;
 *   иначе                  — не вышло, задание считается неудачным.
 */
export async function POST(request: NextRequest) {
    if (!authorized(request)) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    try {
        const body = (await request.json()) as {
            id?: string;
            ok?: boolean;
            result?: unknown;
            error?: string;
            retry?: boolean;
            release?: boolean;
        };
        if (!body.id) return NextResponse.json({ error: 'Нет задания' }, { status: 400 });

        const service = createSupabaseServiceRoleClient();
        const { data: current, error: readError } = await service
            .from('oko_outbox')
            .select('attempts, status')
            .eq('id', body.id)
            .maybeSingle();
        if (readError) throw new Error(readError.message);
        const row = current as { attempts?: number; status?: string } | null;
        if (!row) return NextResponse.json({ error: 'Задание не найдено' }, { status: 404 });

        if (body.release) {
            const { error } = await service
                .from('oko_outbox')
                .update({ status: 'pending', sending_at: null })
                .eq('id', body.id)
                .eq('status', 'sending');
            if (error) throw new Error(error.message);

            return NextResponse.json({ ok: true, status: 'pending' });
        }

        const attempts = (row.attempts ?? 0) + 1;
        const status = body.ok ? 'sent' : body.retry && attempts < 5 ? 'pending' : 'failed';
        // Условие по статусу: запоздавший отчёт не вернёт уже отправленное в очередь.
        const { data: updated, error } = await service
            .from('oko_outbox')
            .update({
                status,
                attempts,
                sending_at: null,
                last_error: body.ok ? null : (body.error ?? 'неизвестная ошибка').slice(0, 500),
                result: (body.result ?? null) as never,
                sent_at: body.ok ? new Date().toISOString() : null,
            })
            .eq('id', body.id)
            .eq('status', 'sending')
            .select('id');
        if (error) throw new Error(error.message);
        if (!updated || updated.length === 0) {
            return NextResponse.json({ ok: true, skipped: `задание уже ${row.status}` });
        }

        return NextResponse.json({ ok: true, status, attempts });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Не удалось записать результат' },
            { status: 500 },
        );
    }
}
