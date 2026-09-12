import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Приём событий из CRM ОКО (живая связь, 12.09.2026).
 *
 * ОКО умеет слать только один тип события — client_message: каждое сообщение
 * во всех каналах (Авито, WhatsApp, Telegram, MAX, ВК), и входящее, и
 * исходящее. Пока менеджеры работают в ОКО, эти события наполняют
 * АБХАЗБИЗНЕС живой перепиской.
 *
 * Порядок важен: событие СНАЧАЛА целиком сохраняется в oko_webhook_events,
 * и только потом разбирается. ОКО повторов не делает и отключает вебхук
 * после нескольких ошибок подряд (так он и умер в августе), поэтому сбой
 * разбора не должен терять сообщение и не должен выглядеть как ошибка.
 *
 * Клиента опознаём по contact_messenger_id или client_id — в событии
 * приходит что-то одно. Оба идентификатора хранятся у клиента списком,
 * поиск и создание — одной функцией в базе, чтобы не плодить дубли.
 */

type OkoMessage = {
    id?: number;
    client_id?: number | null;
    contact_messenger_id?: number | null;
    integration_id?: number | null;
    direction?: string;
    text?: string | null;
    created_at?: number | null;
    author_type?: string | null;
    author?: string | { name?: string } | null;
    files?: unknown[];
};

const authorName = (author: OkoMessage['author']): string | null => {
    if (!author) return null;
    if (typeof author === 'string') return author.slice(0, 120) || null;

    return typeof author.name === 'string' ? author.name.slice(0, 120) || null : null;
};

const fileNames = (files: unknown[] | undefined): string[] =>
    (files ?? [])
        .map((f) =>
            f && typeof f === 'object'
                ? ((f as { filename_original?: string; filename?: string }).filename_original ??
                  (f as { filename?: string }).filename ??
                  null)
                : null,
        )
        .filter((name): name is string => !!name);

const constantEquals = (a: string, b: string): boolean => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Подпись проверяется, только если секрет задан. Тогда заголовок обязателен:
 * иначе проверку можно было бы обойти, просто не прислав подпись.
 */
const signatureOk = (raw: string, request: NextRequest): boolean => {
    const secret = process.env.OKO_WEBHOOK_SECRET;
    if (!secret) return true;
    const got =
        request.headers.get('x-signature') ??
        request.headers.get('x-oko-signature') ??
        request.headers.get('signature');
    if (!got) return false;

    return constantEquals(createHmac('sha256', secret).update(raw).digest('hex'), got.trim());
};

const positive = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

export async function POST(request: NextRequest) {
    const token = process.env.OKO_WEBHOOK_TOKEN;
    const given = request.headers.get('x-oko-token') ?? request.nextUrl.searchParams.get('token') ?? '';
    if (!token || !constantEquals(token, given)) {
        return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const raw = await request.text();
    if (!signatureOk(raw, request)) {
        return NextResponse.json({ ok: true, skipped: 'подпись не сошлась' });
    }

    let body: { webhook_type?: string; data?: OkoMessage };
    try {
        body = JSON.parse(raw) as { webhook_type?: string; data?: OkoMessage };
    } catch {
        // Проверочный запрос ОКО или мусор — отвечаем 200, иначе вебхук отключится.
        return NextResponse.json({ ok: true, skipped: 'не JSON' });
    }

    const m = body.data;
    const messageId = positive(m?.id);
    if (body.webhook_type !== 'client_message' || !m || !messageId) {
        return NextResponse.json({ ok: true, skipped: body.webhook_type ?? 'нет данных' });
    }

    const service = createSupabaseServiceRoleClient();

    // 1. Сохранить как есть. Если дальше что-то упадёт — сообщение не потеряно.
    const { error: saveError } = await service
        .from('oko_webhook_events')
        .upsert({ oko_message_id: messageId, payload: body }, { onConflict: 'oko_message_id' });
    if (saveError) {
        console.error('Вебхук ОКО: не сохранил сырое событие', saveError.message);

        return NextResponse.json({ ok: false, error: 'не сохранили' });
    }

    // 2. Разобрать.
    try {
        const messengerId = positive(m.contact_messenger_id);
        const okoClientId = positive(m.client_id);
        const sentAt = m.created_at ? new Date(m.created_at * 1000).toISOString() : new Date().toISOString();
        const incoming = m.direction === 'incoming';

        const { data: clientId, error: clientError } = await service.rpc('oko_find_or_create_client', {
            p_messenger_id: messengerId,
            p_client_id: okoClientId,
            p_name: incoming ? authorName(m.author) : null,
        });
        if (clientError) throw new Error(`клиент: ${clientError.message}`);

        const { error } = await service.from('deal_messages').upsert(
            {
                oko_message_id: messageId,
                client_id: (clientId as string | null) ?? null,
                oko_client_id: okoClientId,
                oko_contact_messenger_id: messengerId,
                direction: incoming ? 'in' : 'out',
                author_type: m.author_type ?? null,
                author_name: authorName(m.author),
                integration_id: m.integration_id ?? null,
                text: (m.text ?? '').trim() || null,
                files: fileNames(m.files),
                sent_at: sentAt,
                source: 'webhook',
            },
            { onConflict: 'oko_message_id' },
        );
        if (error) throw new Error(`сообщение: ${error.message}`);

        // «Последнее письмо от клиента» — по нему строится экран зависших чатов.
        if (clientId && incoming) {
            await service.from('clients').update({ last_incoming_at: sentAt }).eq('id', clientId as string);
        }

        await service
            .from('oko_webhook_events')
            .update({ processed_at: new Date().toISOString(), error: null })
            .eq('oko_message_id', messageId);

        return NextResponse.json({ ok: true, direction: incoming ? 'in' : 'out' });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'не удалось разобрать';
        console.error('Вебхук ОКО:', message);
        await service
            .from('oko_webhook_events')
            .update({ error: message.slice(0, 500) })
            .eq('oko_message_id', messageId);

        // 200: событие уже сохранено, разберём позже. При 500 ОКО отключит вебхук.
        return NextResponse.json({ ok: true, stored: true, parse_error: true });
    }
}

export async function GET() {
    // ОКО проверяет адрес перед регистрацией.
    return NextResponse.json({ ok: true });
}
