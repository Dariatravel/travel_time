import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Приём событий из CRM ОКО (живая связь, 12.09.2026).
 *
 * ОКО умеет слать только один тип события — client_message: каждое сообщение
 * во всех каналах (Авито, WhatsApp, Telegram, MAX, ВК), и входящее, и
 * исходящее. Пока менеджеры работают в ОКО, эти события наполняют
 * АБХАЗБИЗНЕС живой перепиской.
 *
 * Тело: { webhook_type: "client_message", data: { id, client_id,
 * contact_messenger_id, integration_id, direction, text, created_at,
 * author_type, author, files } }. Номера сделки в событии НЕТ — клиент
 * определяется по contact_messenger_id; если такого клиента ещё нет,
 * заводим временного, чтобы сообщение не потерялось.
 *
 * Защита: секрет в адресе (?token=) — обязателен, плюс подпись ОКО, если
 * пришла. Отвечаем 200 всегда, когда событие принято: ОКО отключает вебхук
 * после нескольких ошибок подряд (так он и умер в августе).
 */

const CHANNELS: Record<number, string> = {
    30: 'Avito',
};

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
    if (typeof author === 'string') return author.slice(0, 120);

    return typeof author.name === 'string' ? author.name.slice(0, 120) : null;
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

const signatureOk = (raw: string, request: NextRequest): boolean => {
    const secret = process.env.OKO_WEBHOOK_SECRET;
    const got = request.headers.get('x-signature') ?? request.headers.get('x-oko-signature') ?? request.headers.get('signature');
    // Подпись проверяем только когда есть и секрет, и заголовок: ОКО шлёт его не всегда.
    if (!secret || !got) return true;
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(got.trim());

    return a.length === b.length && timingSafeEqual(a, b);
};

export async function POST(request: NextRequest) {
    const token = process.env.OKO_WEBHOOK_TOKEN;
    if (!token || request.nextUrl.searchParams.get('token') !== token) {
        return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    try {
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
        if (body.webhook_type !== 'client_message' || !body.data?.id) {
            return NextResponse.json({ ok: true, skipped: body.webhook_type ?? 'нет данных' });
        }

        const m = body.data;
        const service = createSupabaseServiceRoleClient();
        const sentAt = m.created_at ? new Date(m.created_at * 1000).toISOString() : new Date().toISOString();
        const messengerId = m.contact_messenger_id ?? null;

        // Клиент по идентификатору переписки; нет — заводим временного.
        let clientId: string | null = null;
        if (messengerId) {
            const { data: found } = await service
                .from('clients')
                .select('id')
                .eq('oko_contact_messenger_id', messengerId)
                .maybeSingle();
            clientId = (found as { id: string } | null)?.id ?? null;
            if (!clientId) {
                const { data: created, error: createError } = await service
                    .from('clients')
                    .insert({
                        name: authorName(m.author) ?? 'Клиент из ОКО',
                        oko_contact_messenger_id: messengerId,
                        oko_client_id: m.client_id ?? null,
                        note: `Заведён по сообщению из ОКО, канал ${CHANNELS[m.integration_id ?? -1] ?? m.integration_id ?? '—'}`,
                    })
                    .select('id')
                    .single();
                if (createError) throw new Error(`clients: ${createError.message}`);
                clientId = (created as { id: string }).id;
            }
        }

        const incoming = m.direction === 'incoming';
        const { error } = await service.from('deal_messages').upsert(
            {
                oko_message_id: m.id,
                client_id: clientId,
                oko_client_id: m.client_id ?? null,
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
        if (error) throw new Error(`deal_messages: ${error.message}`);

        // «Последнее письмо от клиента» — по нему строится экран зависших чатов.
        if (clientId && incoming) {
            await service
                .from('clients')
                .update({ last_incoming_at: sentAt, oko_client_id: m.client_id ?? null })
                .eq('id', clientId);
        }

        return NextResponse.json({ ok: true, direction: incoming ? 'in' : 'out' });
    } catch (error) {
        console.error('Вебхук ОКО:', error);

        // Ошибку наружу не отдаём: при 500 ОКО быстро отключает вебхук.
        return NextResponse.json({ ok: false, error: 'не удалось сохранить' });
    }
}

export async function GET() {
    // ОКО проверяет адрес перед регистрацией.
    return NextResponse.json({ ok: true });
}

export const runtime = 'nodejs';
