/**
 * Обращения к API Wazzup (https://api.wazzup24.com/v3/).
 *
 * Лимиты частоты Wazzup не публикует, поэтому запросов — минимум:
 * отправка по нажатию человека и настройка по кнопке. Повторов здесь нет
 * намеренно: повтор отправки мог бы продублировать сообщение клиенту.
 * Ключ API — только из переменной окружения, в журнал не пишется.
 */

export const WAZZUP_API_BASE = 'https://api.wazzup24.com/v3';
export const WAZZUP_TIMEOUT_MS = 15_000;

export type WazzupCallResult =
    | { kind: 'http'; status: number; ok: boolean; body: unknown }
    | { kind: 'network'; timeout: boolean; message: string };

export const wazzupApiKey = (): string | null => process.env.WAZZUP_API_KEY?.trim() || null;

export const callWazzup = async (
    apiKey: string,
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    payload?: unknown,
    timeoutMs = WAZZUP_TIMEOUT_MS,
): Promise<WazzupCallResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${WAZZUP_API_BASE}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            body: payload === undefined ? undefined : JSON.stringify(payload),
            signal: controller.signal,
            cache: 'no-store',
        });
        // Тело читаем под тем же таймаутом: обрыв на чтении — тоже «неизвестно».
        const raw = await response.text();
        let body: unknown = null;
        if (raw) {
            try {
                body = JSON.parse(raw);
            } catch {
                body = raw.slice(0, 500);
            }
        }

        return { kind: 'http', status: response.status, ok: response.ok, body };
    } catch (error) {
        const timeout = error instanceof Error && error.name === 'AbortError';

        return {
            kind: 'network',
            timeout,
            message: timeout
                ? `нет ответа за ${Math.round(timeoutMs / 1000)} секунд`
                : error instanceof Error
                  ? error.message.slice(0, 200)
                  : 'сбой сети',
        };
    } finally {
        clearTimeout(timer);
    }
};
