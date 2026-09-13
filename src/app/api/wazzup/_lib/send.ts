import type { WazzupCallResult } from './wazzupApi';

/**
 * Отправка через Wazzup: сборка тела и разбор ответа. Чистые функции —
 * проверяются тестами (send.test.ts).
 *
 * Главное правило: сомнение — это «неизвестно», а не «не ушло». Если связь
 * оборвалась или Wazzup ответил 5xx, сообщение могло уйти; менеджер должен
 * проверить в Instagram, а не отправлять повторно вслепую.
 */

export type SendMode = 'direct' | 'comment_public' | 'comment_private';
export type SendOutcome = 'sent' | 'failed' | 'unknown';

export const SEND_MODES: SendMode[] = ['direct', 'comment_public', 'comment_private'];

export type ChatForSend = {
    kind: 'direct' | 'comment';
    chat_type: string;
    chat_id: string;
    channel_external_id: string;
};

export type WazzupSendBody = {
    channelId: string;
    chatType: string;
    chatId: string;
    text: string;
    refMessageId?: string;
    crmMessageId: string;
};

export const modeAllowed = (kind: ChatForSend['kind'], mode: SendMode): boolean =>
    kind === 'direct' ? mode === 'direct' : mode === 'comment_public' || mode === 'comment_private';

/**
 * Тело POST /v3/message.
 *  direct          — обычный ответ в Direct;
 *  comment_public  — ответ «с цитатой» (refMessageId = комментарий): по справке
 *                    Wazzup уходит публично под пост;
 *  comment_private — ответ без цитаты тому же человеку: по справке уходит в Direct.
 * Оба режима комментариев в API-документации НЕ подтверждены — проверим на
 * пробном периоде. crmMessageId = номер строки очереди (защита от повтора).
 */
export const buildSendBody = (
    chat: ChatForSend,
    mode: SendMode,
    text: string,
    refExternalId: string | null,
    outboxId: string,
): { ok: true; body: WazzupSendBody } | { ok: false; error: string } => {
    if (!SEND_MODES.includes(mode)) return { ok: false, error: 'Неизвестный способ ответа' };
    if (!modeAllowed(chat.kind, mode)) {
        return {
            ok: false,
            error: chat.kind === 'direct' ? 'В Direct отвечают только в Direct' : 'На комментарий — под постом или в Direct',
        };
    }
    if (mode !== 'direct' && !refExternalId) {
        return { ok: false, error: 'Не найден комментарий, на который отвечаем' };
    }

    const body: WazzupSendBody = {
        channelId: chat.channel_external_id,
        chatType: chat.chat_type,
        chatId: chat.chat_id,
        text,
        crmMessageId: outboxId,
    };
    if (mode === 'comment_public' && refExternalId) body.refMessageId = refExternalId;

    return { ok: true, body };
};

const KNOWN_ERRORS: Record<string, string> = {
    REPEATED_CRM_MESSAGE_ID: 'Wazzup уже получал это сообщение — проверьте в Instagram, не ушло ли оно',
    MESSAGE_TEXT_TOO_LONG: 'Текст слишком длинный для этого канала',
    CHANNEL_NOT_FOUND: 'Канал не найден в Wazzup — нажмите «Обновить каналы»',
    MESSAGE_DOWNLOAD_CONTENT_ERROR: 'Wazzup не смог скачать вложение',
    MESSAGES_IS_SPAM: 'Wazzup счёл сообщение спамом и не отправил',
    CHANNEL_UNAVAILABLE: 'Канал недоступен — проверьте подключение Instagram в Wazzup',
};

/** Код ошибки из ответа Wazzup: {error}, [{error}] или хотя бы известный код в тексте. */
export const wazzupErrorCode = (body: unknown): string | null => {
    const pick = (value: unknown): string | null => {
        if (!value || typeof value !== 'object') return null;
        const v = value as Record<string, unknown>;
        for (const key of ['error', 'errorCode', 'code']) {
            if (typeof v[key] === 'string' && v[key]) return v[key] as string;
        }

        return null;
    };
    const direct = Array.isArray(body) ? pick(body[0]) : pick(body);
    if (direct) return direct;
    let text: string;
    try {
        text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
    } catch {
        return null;
    }

    return Object.keys(KNOWN_ERRORS).find((code) => text.includes(code)) ?? null;
};

const wazzupDescription = (body: unknown): string | null => {
    const item = Array.isArray(body) ? body[0] : body;
    if (item && typeof item === 'object') {
        const d = (item as Record<string, unknown>).description;
        if (typeof d === 'string' && d.trim()) return d.trim().slice(0, 300);
    }

    return null;
};

export const describeWazzupError = (status: number, body: unknown): string => {
    const code = wazzupErrorCode(body);
    if (code && KNOWN_ERRORS[code]) return KNOWN_ERRORS[code];
    if (status === 401 || status === 403) return 'Wazzup не принял ключ API — проверьте ключ в настройках';
    if (status === 429) return 'Слишком много запросов к Wazzup — подождите минуту';
    const description = wazzupDescription(body);
    const parts = [`Wazzup ответил ${status}`, code, description].filter(Boolean);

    return parts.join(': ');
};

export const classifySendResult = (
    result: WazzupCallResult,
): { status: SendOutcome; externalMessageId: string | null; error: string | null } => {
    if (result.kind === 'network') {
        return {
            status: 'unknown',
            externalMessageId: null,
            error: `Связь с Wazzup оборвалась (${result.message}) — сообщение могло уйти. Проверьте в Instagram, прежде чем отправлять ещё раз.`,
        };
    }

    if (result.ok) {
        const body = result.body as { messageId?: unknown } | null;
        const id = body && typeof body.messageId === 'string' && body.messageId ? body.messageId : null;

        return { status: 'sent', externalMessageId: id, error: null };
    }

    const code = wazzupErrorCode(result.body);
    // Повтор crmMessageId значит, что Wazzup это сообщение уже получал.
    // 5xx — сбой на их стороне, сообщение могло уйти.
    if (code === 'REPEATED_CRM_MESSAGE_ID' || result.status >= 500) {
        return {
            status: 'unknown',
            externalMessageId: null,
            error: `${describeWazzupError(result.status, result.body)}. Сообщение могло уйти — проверьте в Instagram.`,
        };
    }

    return { status: 'failed', externalMessageId: null, error: describeWazzupError(result.status, result.body) };
};
