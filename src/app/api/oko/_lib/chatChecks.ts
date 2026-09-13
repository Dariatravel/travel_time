import { positive, type OkoMessage } from './processEvent';

/**
 * До какого момента сверка прочитала переписку (13.09.2026).
 *
 * Вебхук ОКО присылает только сообщения клиентов, ответы менеджеров из ОКО
 * приносит сверка. Поэтому «клиент ждёт» подтверждено, только если сверка
 * недавно читала чат и видела его последнее сообщение.
 *
 * Отметку даёт только чтение ПО КОНТАКТУ (contactReadAt — время запроса):
 * ОКО отдаёт сообщения контакта новыми вперёд, и для каждого чата страницы
 * всё, что пришло до запроса и новее присланного, в ней есть. Страница по
 * сделке ничего не доказывает: робот ОКО заводит сделку на обращение, и
 * ответ в чате может лежать в другой сделке. Время самого сообщения тоже не
 * годится — оно говорит, когда писали, а не когда мы смотрели.
 *
 * Не отмечаем:
 *  * чат, где хоть одно сообщение не записалось — это мог быть ответ;
 *  * всю пачку, если в ней есть сообщение без номера чата: такое сообщение
 *    не привязать ни к одному чату, а оно могло быть ответом менеджера
 *    (в выгрузке ОКО таких около 0,1%).
 */

export type ChatCheck = { messenger_id: number; checked_at: string };

/** Ноябрь 2023: время раньше этого — явно мусор, а не момент запроса. */
const EARLIEST_SECONDS = 1_700_000_000;
/**
 * Допуск на расхождение часов Mac mini и сервера. Больше — отказ, а не
 * срезание: спешащие часы сдвинули бы отметку позже реального чтения.
 */
const CLOCK_SKEW_SECONDS = 30;

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

/** Номер контакта ОКО из тела запроса; мусор — null. */
export const parseContactId = (value: unknown): number | null => chatId(value);

/** Все чаты пачки, без повторов. */
export const batchChatIds = (messages: OkoMessage[]): number[] => [
    ...new Set(messages.map((m) => chatId(m.contact_messenger_id)).filter((id): id is number => id !== null)),
];

export const chatChecks = (
    messages: OkoMessage[],
    failedIds: ReadonlySet<number>,
    contactReadAt: number | null,
    nowMs: number,
): ChatCheck[] => {
    if (contactReadAt === null) return [];

    const chats = new Set<number>();
    const broken = new Set<number>();
    for (const m of messages) {
        const chat = chatId(m.contact_messenger_id);
        if (chat === null) return [];
        chats.add(chat);
        const id = positive(m.id);
        if (id === null || failedIds.has(id)) broken.add(chat);
    }

    const checkedAt = new Date(Math.min(contactReadAt, nowMs / 1000) * 1000).toISOString();

    return [...chats].filter((chat) => !broken.has(chat)).map((chat) => ({ messenger_id: chat, checked_at: checkedAt }));
};
