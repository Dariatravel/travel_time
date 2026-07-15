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
 * Преобразует ошибку в ответ с честным статусом: 409 для конфликтов дат,
 * статус HttpError как есть, 500 для остального (раньше всё было 502 —
 * клиент не мог отличить «бронь конфликтует» от «сервер недоступен»).
 */
export const toErrorResponse = (error: unknown, fallbackMessage: string) => {
    if (error instanceof HttpError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const code = (error as { code?: string } | null)?.code;
    const message = error instanceof Error ? error.message : fallbackMessage;

    if (isConflictError(code, message)) {
        return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
};
