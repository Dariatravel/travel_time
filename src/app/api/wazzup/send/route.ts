import { requireAdmin } from '@/app/api/admin/_lib/requireAdmin';
import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { checkReplyText } from '@/features/Instagram/lib/instagram';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { buildSendBody, classifySendResult, SEND_MODES, type ChatForSend, type SendMode } from '../_lib/send';
import { callWazzup, wazzupApiKey } from '../_lib/wazzupApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Отправка ответа через Wazzup (только admin, по нажатию человека).
 *
 * 1. Строка в messenger_outbox (pending). Её id уходит в Wazzup как
 *    crmMessageId — Wazzup 60 секунд не примет повтор с тем же id.
 * 2. POST /v3/message, таймаут 15 секунд.
 * 3. Принято → sent + messageId. Отказ → failed + причина. Обрыв связи,
 *    таймаут или 5xx → unknown: сообщение могло уйти, автоматически НЕ повторяем.
 * Эхо этого сообщения придёт вебхуком; база свяжет его со строкой очереди
 * по messageId, дубля в переписке не будет.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
    const auth = await requireAdmin(request);
    if ('error' in auth) return auth.error;

    const apiKey = wazzupApiKey();
    if (!apiKey) {
        return NextResponse.json({ error: 'Ключ Wazzup не задан (WAZZUP_API_KEY)' }, { status: 503 });
    }

    let input: { chatId?: unknown; mode?: unknown; text?: unknown; refExternalId?: unknown };
    try {
        input = (await request.json()) as typeof input;
    } catch {
        return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
    }

    const chatId = typeof input.chatId === 'string' ? input.chatId : '';
    const mode = (typeof input.mode === 'string' ? input.mode : '') as SendMode;
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!UUID_RE.test(chatId)) return NextResponse.json({ error: 'Не выбран чат' }, { status: 400 });
    if (!SEND_MODES.includes(mode)) return NextResponse.json({ error: 'Неизвестный способ ответа' }, { status: 400 });

    const service = createSupabaseServiceRoleClient();
    const { data: chatRow, error: chatError } = await service
        .from('messenger_chats')
        .select('id, kind, chat_type, chat_id, channel_external_id')
        .eq('id', chatId)
        .maybeSingle();
    if (chatError) return NextResponse.json({ error: chatError.message }, { status: 502 });
    if (!chatRow) return NextResponse.json({ error: 'Чат не найден' }, { status: 404 });
    const chat = chatRow as ChatForSend & { id: string };

    const check = checkReplyText(text, chat.chat_type);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    // На какой комментарий отвечаем: присланный экраном (он должен быть
    // входящим сообщением этого чата) или последний комментарий чата.
    let ref: string | null = null;
    if (mode !== 'direct') {
        const asked = typeof input.refExternalId === 'string' && input.refExternalId ? input.refExternalId : null;
        let query = service
            .from('messenger_messages')
            .select('external_id')
            .eq('chat_id', chat.id)
            .eq('direction', 'in')
            .eq('is_deleted', false);
        query = asked ? query.eq('external_id', asked) : query.order('sent_at', { ascending: false });
        const { data: refRows, error: refError } = await query.limit(1);
        if (refError) return NextResponse.json({ error: refError.message }, { status: 502 });
        ref = ((refRows ?? [])[0] as { external_id?: string } | undefined)?.external_id ?? null;
        if (!ref) return NextResponse.json({ error: 'Комментарий не найден в этом чате' }, { status: 400 });
    }

    const outboxId = randomUUID();
    const built = buildSendBody(chat, mode, text, ref, outboxId);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

    const { error: insertError } = await service.from('messenger_outbox').insert({
        id: outboxId,
        chat_id: chat.id,
        mode,
        ref_external_id: mode === 'direct' ? null : ref,
        text,
        status: 'pending',
        created_by: auth.user.email ?? auth.user.id,
    });
    if (insertError) {
        // Ничего не отправлено: без записи в очереди не шлём.
        return NextResponse.json({ error: `Не записали в очередь: ${insertError.message}` }, { status: 502 });
    }

    const outcome = classifySendResult(await callWazzup(apiKey, 'POST', '/message', built.body));
    const now = new Date().toISOString();

    // Условия по статусу: если эхо успело прийти раньше ответа Wazzup и база
    // уже отметила «отправлено», запоздалый «unknown» его не перепишет.
    let saved = false;
    for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
        const update =
            outcome.status === 'sent'
                ? service
                      .from('messenger_outbox')
                      .update({
                          status: 'sent',
                          external_message_id: outcome.externalMessageId,
                          error: null,
                          sent_at: now,
                          updated_at: now,
                      })
                      .eq('id', outboxId)
                      .in('status', ['pending', 'unknown'])
                : service
                      .from('messenger_outbox')
                      .update({ status: outcome.status, error: outcome.error, updated_at: now })
                      .eq('id', outboxId)
                      .eq('status', 'pending');
        const { error } = await update;
        saved = !error;
    }
    if (!saved) console.error('Wazzup: не записали результат отправки', outboxId, outcome.status);

    if (outcome.status === 'sent') {
        await service.rpc('messenger_refresh_chat', { p_chat: chat.id });
    } else {
        console.error('Wazzup: отправка', outboxId, outcome.status);
    }

    return NextResponse.json({ id: outboxId, status: outcome.status, error: outcome.error });
}
