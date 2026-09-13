/**
 * Какие каналы Wazzup программа принимает (решение 15.09.2026).
 *
 * Каналы включаются ПО ОДНОМУ при переезде из ОКО. Пока WhatsApp и MAX идут
 * через ОКО, их сообщения из Wazzup дали бы дубли клиентов и переписки.
 * Добавили транспорт в этот список — Wazzup-сообщения этого канала начали
 * приниматься: сервер передаёт список в базу (messenger_ingest_batch), экран
 * по нему же помечает каналы «не принимается, пока канал в ОКО».
 * Сообщения неразрешённых каналов пропускаются по правилу, без ошибки.
 */
export const WAZZUP_ACCEPTED_TRANSPORTS: readonly string[] = ['instagram'];

export const isWazzupTransportAccepted = (transport: string | null | undefined): boolean =>
    !!transport && WAZZUP_ACCEPTED_TRANSPORTS.includes(transport.trim().toLowerCase());
