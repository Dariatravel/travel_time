import { positive, type OkoMessage } from './processEvent';

/**
 * До какого момента сверка прочитала переписку (13.09.2026).
 *
 * Вебхук ОКО присылает только сообщения клиентов, ответы менеджеров из ОКО
 * приносит сверка. Поэтому «клиент написал последним» подтверждено, только
 * если сверка читала чат уже после этого сообщения.
 *
 * ОКО отдаёт сообщения новыми вперёд: в странице есть всё, что в каждом её
 * чате новее присланных сообщений. Отсюда момент проверки чата:
 *  * contactReadAt — время запроса в ОКО, если переписку читали ПО КОНТАКТУ.
 *    Страница по сделке для этого не годится: робот ОКО заводит новую сделку
 *    на обращение, и свежие сообщения чата могут лежать в другой сделке;
 *  * иначе — время самого свежего сообщения чата в пачке: всё, что было до
 *    него, мы видели, это надёжная нижняя граница.
 *
 * Чат не отмечается, если хоть одно его сообщение не записалось: пропущенным
 * мог оказаться именно ответ менеджера.
 */

export type ChatCheck = { messenger_id: number; checked_at: string };

/** Ноябрь 2023: время раньше этого — явно мусор, а не момент запроса. */
const EARLIEST_SECONDS = 1_700_000_000;
/** Часы Mac mini могут немного спешить. */
const CLOCK_SKEW_SECONDS = 300;

/** Время запроса в ОКО (секунды) из тела запроса; мусор — null. */
export const parseReadAt = (value: unknown, nowMs: number): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const nowSeconds = nowMs / 1000;
    if (value < EARLIEST_SECONDS || value > nowSeconds + CLOCK_SKEW_SECONDS) return null;

    return Math.min(value, nowSeconds);
};

const chatId = (value: unknown): number | null => {
    const id = positive(value);

    return id !== null && Number.isSafeInteger(id) ? id : null;
};

export const chatChecks = (
    messages: OkoMessage[],
    failedIds: ReadonlySet<number>,
    contactReadAt: number | null,
    nowMs: number,
): ChatCheck[] => {
    const latest = new Map<number, number | null>();
    const broken = new Set<number>();

    for (const m of messages) {
        const chat = chatId(m.contact_messenger_id);
        if (chat === null) continue;
        const id = positive(m.id);
        if (id === null || failedIds.has(id)) broken.add(chat);
        const at = positive(m.created_at);
        const previous = latest.get(chat) ?? null;
        latest.set(chat, at !== null && (previous === null || at > previous) ? at : previous);
    }

    const nowSeconds = nowMs / 1000;
    const result: ChatCheck[] = [];
    for (const [chat, at] of latest) {
        if (broken.has(chat)) continue;
        const seconds = contactReadAt ?? at;
        if (seconds === null) continue;
        result.push({
            messenger_id: chat,
            checked_at: new Date(Math.min(seconds, nowSeconds) * 1000).toISOString(),
        });
    }

    return result;
};
