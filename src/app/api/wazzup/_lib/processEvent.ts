import type { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';

import { normalizeWebhook, WAZZUP_PROVIDER } from './normalize';

/**
 * Разбор одного сохранённого события Wazzup: сообщения, статусы, каналы.
 *
 * Разбирают двое: приём вебхука сразу и повторный разбор (/api/wazzup/reprocess)
 * для событий, что сохранились, но не разобрались. Всё пишется по уникальным
 * ключам (messageId, channelId), поэтому повторный разбор дублей не даёт.
 */

type Service = ReturnType<typeof createSupabaseServiceRoleClient>;

export type ProcessResult =
    | { ok: true; messages: number; statuses: number; channels: number; skipped: string[] }
    | { ok: false; error: string };

export const processEvent = async (service: Service, eventId: number, body: unknown): Promise<ProcessResult> => {
    const parsed = normalizeWebhook(body);
    try {
        for (const message of parsed.messages) {
            const { error } = await service.rpc('messenger_ingest_message', {
                p_provider: WAZZUP_PROVIDER,
                p_msg: message,
            });
            if (error) throw new Error(`сообщение ${message.external_id}: ${error.message}`);
        }

        for (const status of parsed.statuses) {
            const { error } = await service.rpc('messenger_apply_status', {
                p_provider: WAZZUP_PROVIDER,
                p_external_id: status.external_id,
                p_status: status.status,
                p_error: status.error,
                p_at: status.at,
            });
            if (error) throw new Error(`статус ${status.external_id}: ${error.message}`);
        }

        if (parsed.channels.length > 0) {
            // Только состояние: вебхук каналов не присылает transport и plainId,
            // и пустыми значениями затирать их нельзя.
            const now = new Date().toISOString();
            const { error } = await service.from('messenger_channels').upsert(
                parsed.channels.map((c) => ({
                    provider: WAZZUP_PROVIDER,
                    external_id: c.external_id,
                    state: c.state,
                    updated_at: now,
                })),
                { onConflict: 'provider,external_id' },
            );
            if (error) throw new Error(`каналы: ${error.message}`);
        }

        const { error: markError } = await service
            .from('messenger_events')
            .update({
                processed_at: new Date().toISOString(),
                // Пропущенное — не сбой, но видно в журнале: по нему узнаем
                // о новых видах событий Wazzup.
                error: parsed.skipped.length ? `пропущено: ${parsed.skipped.slice(0, 10).join('; ')}`.slice(0, 500) : null,
            })
            .eq('id', eventId);
        if (markError) throw new Error(`отметка: ${markError.message}`);

        return {
            ok: true,
            messages: parsed.messages.length,
            statuses: parsed.statuses.length,
            channels: parsed.channels.length,
            skipped: parsed.skipped,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'не удалось разобрать';
        await service
            .from('messenger_events')
            .update({ error: message.slice(0, 500) })
            .eq('id', eventId);

        return { ok: false, error: message };
    }
};
