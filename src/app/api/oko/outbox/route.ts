import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Очередь заданий в CRM ОКО — для отправителя на Mac mini.
 *
 * Токен ОКО лежит только на Mac mini, поэтому отправляет он: раз в минуту
 * забирает несколько заданий (GET) и отчитывается о результате (POST).
 * У ОКО лимит 5 запросов в минуту на весь аккаунт, поэтому за раз отдаём
 * немного и в порядке важности: сообщение клиенту раньше обновления сделки.
 *
 * Доступ по общему секрету OKO_OUTBOX_TOKEN (в адресе), как у вебхука
 * Telegram: у Mac mini нет входа пользователя.
 */

const MAX_BATCH = 4;

const authorized = (request: NextRequest): boolean => {
    const token = process.env.OKO_OUTBOX_TOKEN;

    return !!token && request.nextUrl.searchParams.get('token') === token;
};

/** Забрать задания и сразу пометить их «отправляются», чтобы не взять дважды. */
export async function GET(request: NextRequest) {
    if (!authorized(request)) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? MAX_BATCH) || MAX_BATCH, MAX_BATCH);
    const service = createSupabaseServiceRoleClient();

    const { data, error } = await service
        .from('oko_outbox')
        .select('id, kind, payload, attempts')
        .eq('status', 'pending')
        .lt('attempts', 5)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const jobs = (data ?? []) as { id: string; kind: string; payload: unknown; attempts: number }[];
    if (jobs.length > 0) {
        const { error: lockError } = await service
            .from('oko_outbox')
            .update({ status: 'sending' })
            .in('id', jobs.map((j) => j.id));
        if (lockError) return NextResponse.json({ error: lockError.message }, { status: 500 });
    }

    return NextResponse.json({ jobs });
}

/** Отчёт отправителя: получилось или нет. */
export async function POST(request: NextRequest) {
    if (!authorized(request)) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    try {
        const body = (await request.json()) as {
            id?: string;
            ok?: boolean;
            result?: unknown;
            error?: string;
            retry?: boolean;
        };
        if (!body.id) return NextResponse.json({ error: 'Нет задания' }, { status: 400 });

        const service = createSupabaseServiceRoleClient();
        const { data: current, error: readError } = await service
            .from('oko_outbox')
            .select('attempts')
            .eq('id', body.id)
            .maybeSingle();
        if (readError) throw new Error(readError.message);
        const attempts = ((current as { attempts?: number } | null)?.attempts ?? 0) + 1;

        // retry=true — временная помеха (лимит, сеть): вернуть в очередь.
        const status = body.ok ? 'sent' : body.retry && attempts < 5 ? 'pending' : 'failed';
        const { error } = await service
            .from('oko_outbox')
            .update({
                status,
                attempts,
                last_error: body.ok ? null : (body.error ?? 'неизвестная ошибка').slice(0, 500),
                result: (body.result ?? null) as never,
                sent_at: body.ok ? new Date().toISOString() : null,
            })
            .eq('id', body.id);
        if (error) throw new Error(error.message);

        return NextResponse.json({ ok: true, status, attempts });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Не удалось записать результат' },
            { status: 500 },
        );
    }
}
