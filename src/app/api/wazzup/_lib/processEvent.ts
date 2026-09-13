import type { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';

import { normalizeWebhook, scrubDeletedPayload, WAZZUP_PROVIDER, type NormalizedMessage } from './normalize';

/**
 * Разбор одного сохранённого события Wazzup: сообщения, статусы, каналы.
 *
 * Разбирают двое: приём вебхука сразу и повторный разбор (/api/wazzup/reprocess)
 * для событий, что сохранились, но не разобрались. Всё пишется по уникальным
 * ключам (messageId, channelId), поэтому повторный разбор дублей не даёт.
 *
 * Бюджет времени: у контейнера 30 секунд на запрос. Сообщения идут в базу
 * пачками по 20 одним обращением; вышло время — событие возвращается в
 * очередь без траты попытки, остаток доразберёт reprocess.
 */

type Service = ReturnType<typeof createSupabaseServiceRoleClient>;

export type ProcessResult =
    | { ok: true; messages: number; statuses: number; channels: number; skipped: string[] }
    | { ok: false; deferred: boolean; error: string };

type BatchResult = {
    messages?: number;
    statuses?: number;
    channels?: number;
    errors?: string[];
    unknown_channels?: string[];
    skipped_channels?: string[];
};

export const CHUNK_SIZE = 20;
const RPC_TIMEOUT_MS = 8_000;
export const DEFAULT_BUDGET_MS = 10_000;

const chunks = (items: NormalizedMessage[]): NormalizedMessage[][] => {
    if (items.length === 0) return [[]];
    const out: NormalizedMessage[][] = [];
    for (let i = 0; i < items.length; i += CHUNK_SIZE) out.push(items.slice(i, i + CHUNK_SIZE));

    return out;
};

export const processEvent = async (
    service: Service,
    eventId: number,
    body: unknown,
    options: { deadline?: number } = {},
): Promise<ProcessResult> => {
    const parsed = normalizeWebhook(body);
    const deadline = options.deadline ?? Date.now() + DEFAULT_BUDGET_MS;
    const totals = { messages: 0, statuses: 0, channels: 0 };
    const errors: string[] = [];
    const unknown = new Set<string>();
    const skipped = [...parsed.skipped];

    try {
        const parts = chunks(parsed.messages);
        for (let i = 0; i < parts.length; i += 1) {
            // Первая пачка идёт всегда, иначе событие не сдвинулось бы никогда.
            if (i > 0 && Date.now() > deadline) {
                await service.rpc('messenger_event_defer', { p_id: eventId });

                return { ok: false, deferred: true, error: 'не успели разобрать — доразберём' };
            }
            const last = i === parts.length - 1;
            const timeout = Math.max(1_000, Math.min(RPC_TIMEOUT_MS, deadline + 5_000 - Date.now()));
            const { data, error } = await service
                .rpc('messenger_ingest_batch', {
                    p_provider: WAZZUP_PROVIDER,
                    p_messages: parts[i],
                    // Статусы и каналы — последней пачкой, после сообщений.
                    p_statuses: last ? parsed.statuses : [],
                    p_channels: last ? parsed.channels : [],
                })
                .abortSignal(AbortSignal.timeout(timeout));
            if (error) throw new Error(`база: ${error.message}`);
            const result = (data ?? {}) as BatchResult;
            totals.messages += result.messages ?? 0;
            totals.statuses += result.statuses ?? 0;
            totals.channels += result.channels ?? 0;
            errors.push(...(result.errors ?? []));
            for (const channel of result.unknown_channels ?? []) unknown.add(channel);
            for (const channel of result.skipped_channels ?? []) skipped.push(`обновление неизвестного канала ${channel}`);
        }

        if (errors.length > 0) throw new Error(errors.slice(0, 5).join('; '));
        // Сообщения чужого или ещё не заведённого канала не пишем. Событие
        // остаётся неразобранным: если это наш новый канал, после «Обновить
        // каналы» повторный разбор его подхватит.
        if (unknown.size > 0) {
            throw new Error(`неизвестный канал: ${[...unknown].slice(0, 3).join(', ')} — нажмите «Обновить каналы»`);
        }

        const scrubbed = scrubDeletedPayload(body);
        const { error: markError } = await service
            .from('messenger_events')
            .update({
                processed_at: new Date().toISOString(),
                // Пропущенное — не сбой, но видно в журнале: по нему узнаем
                // о новых видах событий Wazzup.
                error: skipped.length ? `пропущено: ${skipped.slice(0, 10).join('; ')}`.slice(0, 500) : null,
                ...(scrubbed ? { payload: scrubbed } : {}),
            })
            .eq('id', eventId);
        if (markError) throw new Error(`отметка: ${markError.message}`);

        return { ok: true, ...totals, skipped };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'не удалось разобрать';
        await service
            .from('messenger_events')
            .update({ error: message.slice(0, 500) })
            .eq('id', eventId);

        return { ok: false, deferred: false, error: message };
    }
};
