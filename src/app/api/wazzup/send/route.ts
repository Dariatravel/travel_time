import { requireAdmin } from '@/app/api/admin/_lib/requireAdmin';
import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { checkReplyText, normalizeOutgoingText } from '@/features/Instagram/lib/instagram';
import { NextRequest, NextResponse } from 'next/server';

import {
    buildSendBody,
    classifySendResult,
    SEND_MODES,
    WAZZUP_NOT_CONFIGURED,
    type ChatForSend,
    type SendMode,
} from '../_lib/send';
import { callWazzup, wazzupApiKey } from '../_lib/wazzupApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Отправка ответа через Wazzup (только admin, по нажатию человека).
 *
 * Ключ черновика (draftId) создаёт экран и держит до успеха или правки
 * текста. Он же — id строки очереди и crmMessageId в Wazzup.
 * 1. Строка с этим ключом уже есть — повторное нажатие: возвращаем её
 *    статус и второй раз НЕ отправляем.
 * 2. Вставка INSERT … ON CONFLICT (id) DO NOTHING — защита от двух
 *    одновременных запросов с одним ключом.
 * 3. POST /v3/message, таймаут 15 секунд. Принято → sent + messageId.
 *    Отказ → failed. Обрыв, таймаут, 5xx → unknown: могло уйти, не повторяем.
 * Эхо придёт вебхуком; база свяжет его со строкой очереди, дубля не будет.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_USED = 'На этот комментарий уже писали в Direct — Instagram разрешает один приватный ответ';

type OutboxState = { id: string; chat_id: string; status: string; error: string | null };

export async function POST(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (!auth.user) return auth.error ?? NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const apiKey = wazzupApiKey();
    if (!apiKey) return NextResponse.json({ error: WAZZUP_NOT_CONFIGURED }, { status: 503 });

    let input: { draftId?: unknown; chatId?: unknown; mode?: unknown; text?: unknown; refExternalId?: unknown };
    try {
        input = (await request.json()) as typeof input;
    } catch {
        return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
    }

    const draftId = typeof input.draftId === 'string' ? input.draftId.toLowerCase() : '';
    const chatId = typeof input.chatId === 'string' ? input.chatId : '';
    const mode = (typeof input.mode === 'string' ? input.mode : '') as SendMode;
    const text = typeof input.text === 'string' ? normalizeOutgoingText(input.text) : '';
    if (!UUID_RE.test(draftId)) {
        return NextResponse.json({ error: 'Нет ключа черновика — обновите страницу' }, { status: 400 });
    }
    if (!UUID_RE.test(chatId)) return NextResponse.json({ error: 'Не выбран чат' }, { status: 400 });
    if (!SEND_MODES.includes(mode)) return NextResponse.json({ error: 'Неизвестный способ ответа' }, { status: 400 });

    const service = createSupabaseServiceRoleClient();

    // 1. Повторное нажатие с тем же ключом — только статус, без отправки.
    const existing = async (): Promise<NextResponse | null> => {
        const { data, error } = await service
            .from('messenger_outbox')
            .select('id, chat_id, status, error')
            .eq('id', draftId)
            .maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 502 });
        const row = data as OutboxState | null;
        if (!row) return null;
        if (row.chat_id !== chatId) {
            return NextResponse.json({ error: 'Этот ключ черновика уже использован в другом чате' }, { status: 409 });
        }

        return NextResponse.json({ id: row.id, status: row.status, error: row.error, repeated: true });
    };
    const repeated = await existing();
    if (repeated) return repeated;

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

    // Instagram разрешает один приватный ответ на комментарий. Уже есть
    // отправленный, неподтверждённый или отправляющийся — второй не шлём.
    // В базе это же держит уникальный индекс (на случай гонки).
    if (mode === 'comment_private') {
        const { data: used, error: usedError } = await service
            .from('messenger_outbox')
            .select('id')
            .eq('chat_id', chat.id)
            .eq('mode', 'comment_private')
            .eq('ref_external_id', ref)
            .in('status', ['pending', 'sent', 'unknown'])
            .limit(1);
        if (usedError) return NextResponse.json({ error: usedError.message }, { status: 502 });
        if ((used ?? []).length > 0) return NextResponse.json({ error: PRIVATE_USED }, { status: 409 });
    }

    const built = buildSendBody(chat, mode, text, ref, draftId);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

    // 2. Вставка; повтор ключа — не ошибка, а «уже есть».
    const { data: inserted, error: insertError } = await service
        .from('messenger_outbox')
        .upsert(
            {
                id: draftId,
                chat_id: chat.id,
                mode,
                ref_external_id: mode === 'direct' ? null : ref,
                text,
                status: 'pending',
                created_by: auth.user.email ?? auth.user.id,
            },
            { onConflict: 'id', ignoreDuplicates: true },
        )
        .select('id');
    if (insertError) {
        if (insertError.code === '23505') return NextResponse.json({ error: PRIVATE_USED }, { status: 409 });

        // Ничего не отправлено: без записи в очереди не шлём.
        return NextResponse.json({ error: `Не записали в очередь: ${insertError.message}` }, { status: 502 });
    }
    if (!inserted || inserted.length === 0) {
        // Параллельный запрос с тем же ключом успел раньше.
        return (await existing()) ?? NextResponse.json({ error: 'Черновик не найден' }, { status: 409 });
    }

    // 3. Отправка.
    const outcome = classifySendResult(await callWazzup(apiKey, 'POST', '/message', built.body));
    const now = new Date().toISOString();

    // Условия по статусу: если эхо успело прийти раньше ответа Wazzup и база
    // уже отметила «отправлено» или «не ушло», запоздалый ответ его не перепишет.
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
                      .eq('id', draftId)
                      .in('status', ['pending', 'unknown'])
                : service
                      .from('messenger_outbox')
                      .update({ status: outcome.status, error: outcome.error, updated_at: now })
                      .eq('id', draftId)
                      .eq('status', 'pending');
        const { error } = await update;
        saved = !error;
    }
    if (!saved) console.error('Wazzup: не записали результат отправки', draftId, outcome.status);

    if (outcome.status === 'sent') {
        await service.rpc('messenger_refresh_chat', { p_chat: chat.id });
    } else {
        console.error('Wazzup: отправка', draftId, outcome.status);
    }

    return NextResponse.json({ id: draftId, status: outcome.status, error: outcome.error });
}
