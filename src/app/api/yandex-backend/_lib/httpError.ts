import { NextResponse } from 'next/server';

/** Ошибка с HTTP-статусом для прокси-роутов. */
export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'HttpError';
    }
}

const CONFLICT_ERRCODE = '23P01'; // exclusion_violation: триггер/constraint запрета наложений

const isConflictError = (code: string | undefined, message: string) =>
    code === CONFLICT_ERRCODE ||
    /Наложение броней|закрытие номера|Номер закрыт/.test(message);

/**
 * Достаёт сообщение и код из любой ошибки.
 *
 * Ошибки Supabase (PostgrestError) — обычные объекты, НЕ instanceof Error.
 * Раньше их message терялся, и клиент видел общий fallback («Failed to
 * create reserve») — из-за этого 15.07.2026 диагностика инцидента с
 * отсутствующей колонкой is_fixed (PGRST204) заняла заметно дольше.
 */
export const extractErrorInfo = (
    error: unknown,
): { message?: string; code?: string } => {
    if (error instanceof Error) {
        return { message: error.message };
    }

    if (typeof error === 'string') {
        const trimmed = error.trim();
        return trimmed ? { message: trimmed } : {};
    }

    if (typeof error === 'object' && error !== null) {
        const record = error as { message?: unknown; code?: unknown };
        const code = typeof record.code === 'string' ? record.code : undefined;
        const message =
            typeof record.message === 'string' && record.message.trim() !== ''
                ? record.message
                : undefined;
        return { message, code };
    }

    return {};
};

/**
 * Преобразует ошибку в ответ с честным статусом: 409 для конфликтов дат,
 * статус HttpError как есть, 500 для остального. Для неожиданных ошибок
 * в сообщение добавляется код (SQLSTATE/PGRST…) — по нему причина видна
 * сразу, без раскопок серверных логов.
 */
export const toErrorResponse = (error: unknown, fallbackMessage: string) => {
    if (error instanceof HttpError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const { message, code } = extractErrorInfo(error);

    if (isConflictError(code, message ?? '')) {
        return NextResponse.json({ error: message }, { status: 409 });
    }

    const detailedMessage = message
        ? code
          ? `${message} (код ${code})`
          : message
        : fallbackMessage;

    return NextResponse.json({ error: detailedMessage }, { status: 500 });
};
