import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { batchChatIds, chatChecks, parseContactId, parseReadAt } from '../_lib/chatChecks';
import { processEvent, type OkoMessage } from '../_lib/processEvent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Приём сообщений, добранных сверкой с ОКО (14.09.2026, по внешнему ревью).
 *
 * Вебхук ОКО повторов не делает: если приём не смог записать событие, оно
 * потеряно навсегда. Поэтому Mac mini периодически перечитывает переписки
 * через API ОКО и досылает сюда всё, чего у нас нет. Запись идёт по ключу
 * сообщения, поэтому повторы безвредны.
 *
 * Чего сверка НЕ гарантирует: ОКО не отдаёт «все сообщения с такого-то
 * времени» — только по сделке или контакту, и не умеет сортировать список
 * сделок. Поэтому сверка обходит новые сделки и по кругу перечитывает
 * недавно оживавшие переписки, а не всю историю.
 */

const MAX_MESSAGES = 200;

const constantEquals = (a: string, b: string): boolean => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    return left.length === right.length && timingSafeEqual(left, right);
};

const authorized = (request: NextRequest): boolean => {
    const token = process.env.OKO_OUTBOX_TOKEN;
    const given = request.headers.get('x-oko-token') ?? '';

    return !!token && constantEquals(token, given);
};

export async function POST(request: NextRequest) {
    if (!authorized(request)) {
        return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    let messages: OkoMessage[];
    let readAt: number | null;
    let contactId: number | null;
    let received = 0;
    try {
        // oko_contact_id — чей это чат в ОКО (сверка берёт из сделки или
        // читает по контакту). contact_read_at — когда Mac mini читал
        // переписку (секунды), только при чтении ПО КОНТАКТУ; без номера
        // контакта не принимается. См. chatChecks.
        const body = (await request.json()) as {
            messages?: unknown;
            contact_read_at?: unknown;
            oko_contact_id?: unknown;
        };
        if (!Array.isArray(body.messages)) throw new Error('нет сообщений');
        received = body.messages.length;
        messages = (body.messages as unknown[]).filter(
            (m): m is OkoMessage => !!m && typeof m === 'object',
        );
        contactId = parseContactId(body.oko_contact_id);
        readAt = contactId ? parseReadAt(body.contact_read_at, Date.now()) : null;
    } catch {
        return NextResponse.json({ error: 'Ожидался {"messages": [...]}' }, { status: 400 });
    }
    if (received > MAX_MESSAGES) {
        return NextResponse.json({ error: `Не больше ${MAX_MESSAGES} сообщений за раз` }, { status: 413 });
    }

    const service = createSupabaseServiceRoleClient();

    // Что из присланного у нас уже есть — чтобы не гонять разбор впустую
    // и честно отчитаться, сколько сверка реально добрала.
    const ids = messages
        .map((m) => m.id)
        .filter((id): id is number => typeof id === 'number' && id > 0);
    const { data: known, error: knownError } = await service
        .from('deal_messages')
        .select('oko_message_id')
        .in('oko_message_id', ids.length ? ids : [0]);
    if (knownError) {
        return NextResponse.json({ error: knownError.message }, { status: 502 });
    }
    const have = new Set((known ?? []).map((r) => (r as { oko_message_id: number }).oko_message_id));

    let added = 0;
    let failed = 0;
    const failedIds = new Set<number>();
    const errors: string[] = [];
    for (const message of messages) {
        const id = message.id;
        if (typeof id !== 'number' || id <= 0 || have.has(id)) continue;

        // Кладём в тот же журнал событий: сверка и вебхук идут одной дорогой.
        const payload = { webhook_type: 'client_message', data: message };
        const { error: saveError } = await service
            .from('oko_webhook_events')
            .upsert({ oko_message_id: id, payload, headers: { источник: 'сверка' } }, { onConflict: 'oko_message_id' });
        if (saveError) {
            failed += 1;
            failedIds.add(id);
            if (errors.length < 5) errors.push(`${id}: ${saveError.message}`);
            continue;
        }

        const result = await processEvent(service, id, payload);
        if (result.ok) added += 1;
        else {
            failed += 1;
            failedIds.add(id);
            if (errors.length < 5) errors.push(`${id}: ${result.error}`);
        }
    }

    // Отметка «сверка прочитала чат». Вебхук исходящие не присылает, и без
    // отметки экран не отличит неотвеченный чат от чата, ответ в котором
    // просто ещё не дошёл. Сбой отметки не отменяет добранные сообщения.
    const checks = chatChecks(messages, failedIds, readAt, Date.now());
    let checkError: string | null = null;
    if (checks.length) {
        const { error } = await service.rpc('oko_mark_chats_checked', { p_checks: checks });
        if (error) checkError = error.message;
    }

    // Чей это чат в ОКО: без номера контакта сверка не может перечитать чат
    // временной карточки. Карточки клиентов при этом не меняются.
    const chats = batchChatIds(messages);
    let contactError: string | null = null;
    if (contactId && chats.length) {
        const { error } = await service.rpc('oko_note_chat_contacts', {
            p_contact_id: contactId,
            p_messenger_ids: chats,
        });
        if (error) contactError = error.message;
    }

    return NextResponse.json({
        ok: true,
        прислано: received,
        уже_было: received - (added + failed),
        добрано: added,
        не_вышло: failed,
        ошибки: errors,
        чатов_проверено: checkError ? 0 : checks.length,
        ...(checkError ? { ошибка_отметки: checkError } : {}),
        ...(contactError ? { ошибка_контакта: contactError } : {}),
    });
}
