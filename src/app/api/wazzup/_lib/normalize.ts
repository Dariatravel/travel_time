/**
 * Тело вебхука Wazzup → строки для базы. Чистые функции: без сети и базы,
 * их проверяют тесты (normalize.test.ts).
 *
 * В одном запросе Wazzup может прислать сразу messages, statuses и
 * channelsUpdates. Проверочный запрос при подписке — {"test": true}.
 * Кривые элементы не роняют весь запрос: они пропускаются с причиной.
 */

export const WAZZUP_PROVIDER = 'wazzup';

/** Типы чатов из документации Wazzup (13.09.2026). */
export const KNOWN_CHAT_TYPES = [
    'whatsapp',
    'whatsgroup',
    'viber',
    'instagram',
    'telegram',
    'telegroup',
    'vk',
    'avito',
    'max',
    'maxgroup',
] as const;

/** Групповые чаты: у них нет одного собеседника, клиента не заводим. */
const GROUP_CHAT_TYPES = new Set(['whatsgroup', 'telegroup', 'maxgroup']);

/** Неизвестный, но аккуратный тип чата сохраняем (схема общая), мусор — нет. */
const SAFE_CHAT_TYPE = /^[a-z][a-z0-9_]{0,31}$/;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
    !!value && typeof value === 'object' && !Array.isArray(value);

/** Строка без краевых пробелов; число → строка; пусто и прочее → null. */
export const str = (value: unknown, max = 2000): string | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();

    return trimmed ? trimmed.slice(0, max) : null;
};

const bool = (value: unknown): boolean => value === true || value === 'true';

/** Текст сообщения — как есть (переносы важны), но пустой → null. */
const textOf = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.slice(0, 10_000) : null;

/**
 * Время: ISO-строка, миллисекунды или секунды → ISO. Мусор → null
 * (тогда база поставит время приёма).
 */
export const toIso = (value: unknown): string | null => {
    let ms: number;
    if (typeof value === 'number' && Number.isFinite(value)) {
        ms = value < 1e11 ? value * 1000 : value;
    } else if (typeof value === 'string' && value.trim()) {
        const s = value.trim();
        if (/^\d+$/.test(s)) {
            const n = Number(s);
            ms = n < 1e11 ? n * 1000 : n;
        } else {
            ms = Date.parse(s);
        }
    } else {
        return null;
    }
    if (!Number.isFinite(ms)) return null;
    const date = new Date(ms);
    const year = date.getUTCFullYear();

    return year >= 2000 && year <= 2100 ? date.toISOString() : null;
};

/** {error, description} → «CODE: описание». */
const errorText = (value: unknown): string | null => {
    if (isObject(value)) {
        const text = [str(value.error, 100), str(value.description, 400)].filter(Boolean).join(': ');

        return text || null;
    }

    return str(value, 500);
};

/**
 * Ключ чата. Ник Instagram не зависит от регистра и может прийти с «@»:
 * kate и Kate — один человек, один чат и одна карточка клиента.
 */
export const chatKeyOf = (chatType: string, chatId: string): string =>
    chatType === 'instagram' ? chatId.replace(/^@+/, '').toLowerCase() : chatId;

export type NormalizedPost = {
    external_id: string;
    src: string | null;
    description: string | null;
    author: string | null;
    posted_at: string | null;
};

export type NormalizedMessage = {
    external_id: string;
    channel_external_id: string;
    chat_type: string;
    chat_id: string;
    kind: 'direct' | 'comment';
    post: NormalizedPost | null;
    /** Вид личности для карточки клиента; null — клиента не заводить (группы, комментарии). */
    identity_kind: string | null;
    contact: { name: string | null; username: string | null; avatar_uri: string | null };
    direction: 'in' | 'out';
    is_echo: boolean;
    sent_from_app: boolean;
    author_name: string | null;
    type: string;
    text: string | null;
    content_uri: string | null;
    status: string | null;
    error: string | null;
    quoted_external_id: string | null;
    is_edited: boolean;
    is_deleted: boolean;
    sent_at: string | null;
    raw: Json | null;
};

export type NormalizedStatus = {
    external_id: string;
    status: string;
    error: string | null;
    at: string | null;
};

export type NormalizedChannel = {
    external_id: string;
    transport: string | null;
    plain_id: string | null;
    state: string | null;
};

export type NormalizedWebhook = {
    test: boolean;
    messages: NormalizedMessage[];
    statuses: NormalizedStatus[];
    channels: NormalizedChannel[];
    /** Что пропущено и почему — пишется в журнал события. */
    skipped: string[];
};

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

export const normalizeMessage = (raw: unknown): Result<NormalizedMessage> => {
    if (!isObject(raw)) return { ok: false, reason: 'сообщение не объект' };

    const externalId = str(raw.messageId, 200);
    if (!externalId) return { ok: false, reason: 'сообщение без messageId' };
    const channel = str(raw.channelId, 200);
    if (!channel) return { ok: false, reason: `${externalId}: нет channelId` };
    const chatIdRaw = str(raw.chatId, 300);
    if (!chatIdRaw) return { ok: false, reason: `${externalId}: нет chatId` };
    const chatType = str(raw.chatType, 64)?.toLowerCase() ?? null;
    if (!chatType || !SAFE_CHAT_TYPE.test(chatType)) {
        return { ok: false, reason: `${externalId}: неизвестный тип чата «${String(raw.chatType).slice(0, 40)}»` };
    }
    const chatId = chatKeyOf(chatType, chatIdRaw);
    if (!chatId) return { ok: false, reason: `${externalId}: нет chatId` };
    const known = (KNOWN_CHAT_TYPES as readonly string[]).includes(chatType);

    // Отдельного флага «комментарий» у Wazzup нет — признак только instPost.
    const inst = isObject(raw.instPost) ? raw.instPost : null;
    let post: NormalizedPost | null = null;
    if (inst) {
        const postKey = str(inst.id, 200) ?? str(inst.sha1, 200) ?? str(inst.src, 500);
        // Без ключа пост не склеиваем в общий «unknown»: комментарии разных
        // постов смешались бы в один чат.
        if (!postKey) return { ok: false, reason: `${externalId}: у поста нет id, sha1 и src` };
        post = {
            external_id: postKey,
            src: str(inst.src, 1000),
            description: str(inst.description, 5000),
            author: str(inst.authorName, 200) ?? str(inst.author, 200),
            posted_at: toIso(inst.timestamp),
        };
    }

    const contact = isObject(raw.contact) ? raw.contact : {};
    const isEcho = bool(raw.isEcho);
    const isDeleted = bool(raw.isDeleted);

    return {
        ok: true,
        value: {
            external_id: externalId,
            channel_external_id: channel,
            chat_type: chatType,
            chat_id: chatId,
            kind: post ? 'comment' : 'direct',
            post,
            // Карточка — только для Direct одного человека (решение 15.09.2026).
            identity_kind: !post && known && !GROUP_CHAT_TYPES.has(chatType) ? chatType : null,
            contact: {
                name: str(contact.name, 200),
                username: str(contact.username, 200),
                avatar_uri: str(contact.avatarUri, 1000),
            },
            // isEcho — исходящее от нас (из нашей программы или из чата Wazzup).
            direction: isEcho ? 'out' : 'in',
            is_echo: isEcho,
            sent_from_app: bool(raw.sentFromApp),
            author_name: str(raw.authorName, 200),
            type: str(raw.type, 40)?.toLowerCase() ?? 'unknown',
            // Удалённое клиентом не храним: ни текст, ни ссылку, ни сырое тело.
            text: isDeleted ? null : textOf(raw.text),
            // Только ссылка: медиа из упоминаний в историях хранить нельзя.
            content_uri: isDeleted ? null : str(raw.contentUri, 2000),
            status: str(raw.status, 40)?.toLowerCase() ?? null,
            error: errorText(raw.error),
            quoted_external_id: isObject(raw.quotedMessage) ? str(raw.quotedMessage.messageId, 200) : null,
            is_edited: bool(raw.isEdited),
            is_deleted: isDeleted,
            sent_at: toIso(raw.dateTime),
            raw: isDeleted ? null : raw,
        },
    };
};

export const normalizeStatus = (raw: unknown): Result<NormalizedStatus> => {
    if (!isObject(raw)) return { ok: false, reason: 'статус не объект' };
    const externalId = str(raw.messageId, 200);
    const status = str(raw.status, 40)?.toLowerCase() ?? null;
    if (!externalId || !status) return { ok: false, reason: 'статус без messageId или status' };

    return {
        ok: true,
        value: { external_id: externalId, status, error: errorText(raw.error), at: toIso(raw.timestamp) },
    };
};

export const normalizeChannel = (raw: unknown): Result<NormalizedChannel> => {
    if (!isObject(raw)) return { ok: false, reason: 'канал не объект' };
    const externalId = str(raw.channelId, 200);
    if (!externalId) return { ok: false, reason: 'канал без channelId' };

    return {
        ok: true,
        value: {
            external_id: externalId,
            transport: str(raw.transport, 40)?.toLowerCase() ?? null,
            plain_id: str(raw.plainId, 200),
            state: str(raw.state, 40),
        },
    };
};

const collect = <T>(
    list: unknown,
    field: string,
    normalize: (raw: unknown) => Result<T>,
    out: T[],
    skipped: string[],
) => {
    if (list === undefined || list === null) return;
    if (!Array.isArray(list)) {
        skipped.push(`${field} не массив`);

        return;
    }
    for (const item of list) {
        const result = normalize(item);
        if (result.ok) out.push(result.value);
        else skipped.push(result.reason);
    }
};

export const normalizeWebhook = (body: unknown): NormalizedWebhook => {
    const result: NormalizedWebhook = { test: false, messages: [], statuses: [], channels: [], skipped: [] };
    if (!isObject(body)) {
        result.skipped.push('тело не объект');

        return result;
    }
    if (body.test === true) {
        result.test = true;

        return result;
    }

    collect(body.messages, 'messages', normalizeMessage, result.messages, result.skipped);
    collect(body.statuses, 'statuses', normalizeStatus, result.statuses, result.skipped);
    collect(body.channelsUpdates, 'channelsUpdates', normalizeChannel, result.channels, result.skipped);

    if (
        body.messages === undefined &&
        body.statuses === undefined &&
        body.channelsUpdates === undefined
    ) {
        result.skipped.push('нет messages, statuses и channelsUpdates');
    }

    return result;
};

// Содержимое удалённых сообщений из сырого журнала стирает база
// (messenger_ingest_message) — во всех событиях сразу, а не только в текущем.

/** Ответ GET /v3/channels → каналы. Не массив — пусто. */
export const normalizeChannelList = (body: unknown): NormalizedChannel[] => {
    const out: NormalizedChannel[] = [];
    collect(Array.isArray(body) ? body : [], 'channels', normalizeChannel, out, []);

    return out;
};
