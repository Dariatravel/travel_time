import type { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';

/**
 * Разбор одного события ОКО: из сырого события в переписку.
 *
 * Вынесено отдельно, потому что разбирают его двое: приём вебхука сразу и
 * повторный разбор для тех событий, что сохранились, но не разобрались
 * (база была занята, клиент не завёлся и т. п.).
 */

export type OkoMessage = {
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

export type OkoEventBody = { webhook_type?: string; data?: OkoMessage };

type Service = ReturnType<typeof createSupabaseServiceRoleClient>;

export const authorName = (author: OkoMessage['author']): string | null => {
    if (!author) return null;
    if (typeof author === 'string') return author.slice(0, 120) || null;

    return typeof author.name === 'string' ? author.name.slice(0, 120) || null : null;
};

export const fileNames = (files: unknown[] | undefined): string[] =>
    (files ?? [])
        .map((f) =>
            f && typeof f === 'object'
                ? ((f as { filename_original?: string; filename?: string }).filename_original ??
                  (f as { filename?: string }).filename ??
                  null)
                : null,
        )
        .filter((name): name is string => !!name);

export const positive = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/**
 * Разобрать событие. Успех — событие помечено разобранным; ошибка — текст
 * записан в событие, и оно останется в очереди на повторный разбор.
 */
export const processEvent = async (
    service: Service,
    messageId: number,
    body: OkoEventBody,
): Promise<{ ok: true; direction: 'in' | 'out' } | { ok: false; error: string }> => {
    const m = body.data ?? {};
    try {
        const messengerId = positive(m.contact_messenger_id);
        const okoClientId = positive(m.client_id);
        const sentAt = m.created_at
            ? new Date(m.created_at * 1000).toISOString()
            : new Date().toISOString();
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

        // «Последнее письмо от клиента» — только вперёд: запоздалое событие
        // не должно откатить отметку назад.
        if (clientId && incoming) {
            await service.rpc('oko_touch_last_incoming', { p_client: clientId as string, p_at: sentAt });
        }

        const { error: markError } = await service
            .from('oko_webhook_events')
            .update({ processed_at: new Date().toISOString(), error: null })
            .eq('oko_message_id', messageId);
        // Сообщение записано; не поставили отметку — разберём повторно,
        // запись идёт по ключу, второй раз дубля не будет.
        if (markError) throw new Error(`отметка: ${markError.message}`);

        return { ok: true, direction: incoming ? 'in' : 'out' };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'не удалось разобрать';
        await service
            .from('oko_webhook_events')
            .update({ error: message.slice(0, 500) })
            .eq('oko_message_id', messageId);

        return { ok: false, error: message };
    }
};
