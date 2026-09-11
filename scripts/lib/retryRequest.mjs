// Повтор временных сбоев при обращении к чужим календарям.
//
// Зачем: у внешних систем регулярно случаются короткие осечки — 5xx, обрыв
// связи, ограничение по частоте. Без повтора одна такая осечка означает
// «источник ответил неполно», и синхронизация ВСЕГО отеля отменяется: занятость
// остаётся вчерашней, а менеджер этого не видит.
//
// Так было с «Норой»: чтение FrontDesk24 делает по запросу на каждую свободную
// ночь в горизонте (до 365 дней), и любая одна неудача из сотен помечала ответ
// неполным. С 09.09.2026 занятость не обновлялась 37 часов подряд.
//
// Постоянные ошибки (404, 403 — календарь удалили или закрыли) не повторяем:
// повтор ничего не изменит, а честная неполнота ответа должна дойти до отчёта.

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Временная ли ошибка: по статусу ответа либо по тексту сетевого сбоя. */
export const isTransientRequestError = (error) => {
    if (!error) return false;

    const status = Number(error.status);
    if (Number.isInteger(status)) return TRANSIENT_STATUS.has(status);

    const message = String(error.message ?? error).toLowerCase();

    return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('fetch failed') ||
        message.includes('socket') ||
        message.includes('connection') ||
        message.includes('econnreset')
    );
};

/**
 * Повторяет операцию при временных сбоях с нарастающей паузой.
 *
 * @param {() => Promise<T>} operation
 * @param {{ retries?: number, baseDelayMs?: number, onRetry?: (error: unknown, attempt: number) => void }} options
 * @returns {Promise<T>}
 * @template T
 */
export const withRequestRetry = async (operation, options = {}) => {
    const retries = options.retries ?? 2;
    const baseDelayMs = options.baseDelayMs ?? 300;

    for (let attempt = 0; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= retries || !isTransientRequestError(error)) throw error;

            options.onRetry?.(error, attempt + 1);
            await sleep(baseDelayMs * 2 ** attempt);
        }
    }
};

/** Ошибка с полем status — чтобы повтор мог отличить временный сбой от постоянного. */
export const requestError = (message, status) =>
    Object.assign(new Error(message), { status });
