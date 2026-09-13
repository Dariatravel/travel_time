import type { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { WAZZUP_ACCEPTED_TRANSPORTS } from '@/shared/config/wazzupTransports';

import { normalizeWebhook, WAZZUP_PROVIDER, type NormalizedMessage } from './normalize';

/**
 * Разбор одного сохранённого события Wazzup: сообщения, статусы, каналы.
 *
 * Разбирают двое: приём вебхука сразу и повторный разбор (/api/wazzup/reprocess)
 * для событий, что сохранились, но не разобрались. Всё пишется по уникальным
 * ключам (messageId, channelId), поэтому повторный разбор дублей не даёт.
 *
 * Пропуск по правилу (неизвестный канал, транспорт не из
 * WAZZUP_ACCEPTED_TRANSPORTS, кривое тело) — не ошибка: событие получает
 * processed_at, причины видны в его поле error.
 *
 * Бюджет времени: у контейнера 30 секунд на запрос. Сообщения идут в базу
 * пачками по 20 одним обращением; вышло время — событие возвращается в
 * очередь (не больше 5 раз без траты попытки), остаток доразберёт reprocess.
 * У каждой записи в базу свой таймаут.
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
    skipped?: string[];
};

export const CHUNK_SIZE = 20;
const RPC_TIMEOUT_MS = 8_000;
const WRITE_TIMEOUT_MS = 5_000;
export const DEFAULT_BUDGET_MS = 10_000;

const writeSignal = () => AbortSignal.timeout(WRITE_TIMEOUT_MS);

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
    const skipped = [...parsed.skipped];

    try {
        const parts = chunks(parsed.messages);
        for (let i = 0; i < parts.length; i += 1) {
            // Первая пачка идёт всегда, иначе событие не сдвинулось бы никогда.
            if (i > 0 && Date.now() > deadline) {
                try {
                    await service.rpc('messenger_event_defer', { p_id: eventId }).abortSignal(writeSignal());
                } catch {
                    // Не записали отсрочку — событие и так неразобрано, reprocess его найдёт.
                }

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
                    p_allowed_transports: [...WAZZUP_ACCEPTED_TRANSPORTS],
                })
                .abortSignal(AbortSignal.timeout(timeout));
            if (error) throw new Error(`база: ${error.message}`);
            const result = (data ?? {}) as BatchResult;
            totals.messages += result.messages ?? 0;
            totals.statuses += result.statuses ?? 0;
            totals.channels += result.channels ?? 0;
            errors.push(...(result.errors ?? []));
            for (const reason of result.skipped ?? []) if (!skipped.includes(reason)) skipped.push(reason);
        }

        if (errors.length > 0) throw new Error(errors.slice(0, 5).join('; '));

        const { error: markError } = await service
            .from('messenger_events')
            .update({
                processed_at: new Date().toISOString(),
                // Пропущенное — не сбой, но видно в журнале: по нему узнаем о
                // чужих каналах и новых видах событий Wazzup.
                error: skipped.length ? `пропущено: ${skipped.slice(0, 10).join('; ')}`.slice(0, 500) : null,
            })
            .eq('id', eventId)
            .abortSignal(writeSignal());
        if (markError) throw new Error(`отметка: ${markError.message}`);

        return { ok: true, ...totals, skipped };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'не удалось разобрать';
        try {
            // Обычная ошибка обрывает серию отсрочек (см. messenger_event_defer).
            await service
                .from('messenger_events')
                .update({ error: message.slice(0, 500), defers: 0 })
                .eq('id', eventId)
                .abortSignal(writeSignal());
        } catch {
            // Не записали причину — событие всё равно останется неразобранным.
        }

        return { ok: false, deferred: false, error: message };
    }
};
