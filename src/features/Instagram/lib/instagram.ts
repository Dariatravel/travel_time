/**
 * Instagram через Wazzup — чистые функции экрана и отправки. Проверяются
 * тестами (instagram.test.ts). Сервер (/api/wazzup/send) берёт отсюда же
 * проверку длины текста, чтобы правило было одно.
 *
 * Правила Instagram (на 13.09.2026):
 *  - ответить в Direct можно в течение 24 часов после последнего сообщения
 *    клиента; живой человек — до 7 дней;
 *  - приватный ответ на комментарий — в течение 7 дней и один раз;
 *  - писать первым нельзя.
 * По истечении сроков экран предупреждает, но не запрещает: как Wazzup
 * поведёт себя на границе, проверим на пробном периоде.
 */

export type ChatKind = 'direct' | 'comment';
export type SendMode = 'direct' | 'comment_public' | 'comment_private';
export type OutboxStatus = 'pending' | 'sent' | 'failed' | 'unknown';

/** Строка функции messenger_chat_list. */
export type ChatRow = {
    chat_id: string;
    kind: ChatKind;
    chat_type: string;
    channel_external_id: string;
    external_chat_id: string;
    contact_name: string | null;
    contact_username: string | null;
    avatar_uri: string | null;
    client_id: string | null;
    client_name: string | null;
    is_provisional: boolean;
    last_inbound_at: string | null;
    last_message_at: string | null;
    waiting_since: string | null;
    last_text: string | null;
    last_direction: 'in' | 'out' | null;
    last_type: string | null;
    last_inbound_external_id: string | null;
    post_id: string | null;
    post_external_id: string | null;
    post_src: string | null;
    post_description: string | null;
    post_author: string | null;
    private_reply_used: boolean;
};

export type MessageRow = {
    id: number;
    external_id: string;
    direction: 'in' | 'out';
    is_echo: boolean;
    sent_from_app: boolean;
    author_name: string | null;
    type: string | null;
    text: string | null;
    content_uri: string | null;
    status: string | null;
    error: string | null;
    is_edited: boolean;
    is_deleted: boolean;
    sent_at: string;
};

export type OutboxRow = {
    id: string;
    mode: SendMode;
    ref_external_id: string | null;
    text: string;
    status: OutboxStatus;
    external_message_id: string | null;
    error: string | null;
    created_by: string | null;
    created_at: string;
    sent_at: string | null;
};

export type ChannelRow = {
    external_id: string;
    transport: string | null;
    plain_id: string | null;
    state: string | null;
    updated_at: string;
};

// ─── Длина текста ──────────────────────────────────────────────────────────

/** Лимиты текста по типу чата. Instagram — 1000 символов (Wazzup). */
export const TEXT_LIMITS: Record<string, number> = { instagram: 1000 };
export const DEFAULT_TEXT_LIMIT = 4096;

export const textLimit = (chatType: string): number => TEXT_LIMITS[chatType] ?? DEFAULT_TEXT_LIMIT;

/**
 * Длина считается по String.length (эмодзи — за два знака). Это строже, чем
 * «по буквам», и потому безопасно: слишком длинное Wazzup отклонит.
 */
export const checkReplyText = (
    text: string,
    chatType: string,
): { ok: boolean; length: number; limit: number; error: string | null } => {
    const limit = textLimit(chatType);
    const length = text.length;
    if (!text.trim()) return { ok: false, length, limit, error: 'Пустой ответ' };
    if (length > limit) return { ok: false, length, limit, error: `Слишком длинно: ${length} из ${limit} знаков` };

    return { ok: true, length, limit, error: null };
};

// ─── Окна ответа ───────────────────────────────────────────────────────────

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
export const DIRECT_WINDOW_MS = 24 * HOUR_MS;
export const HUMAN_AGENT_WINDOW_MS = 7 * DAY_MS;
export const PRIVATE_REPLY_WINDOW_MS = 7 * DAY_MS;

const plural = (n: number, one: string, few: string, many: string): string => {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return many;
    const mod10 = n % 10;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;

    return many;
};

/** «2 дня 3 ч», «5 ч 20 мин», «18 мин». */
export const humanDuration = (ms: number): string => {
    const minutesTotal = Math.max(1, Math.floor(ms / 60_000));
    const days = Math.floor(minutesTotal / (24 * 60));
    const hours = Math.floor((minutesTotal % (24 * 60)) / 60);
    const minutes = minutesTotal % 60;
    if (days > 0) return hours ? `${days} ${plural(days, 'день', 'дня', 'дней')} ${hours} ч` : `${days} ${plural(days, 'день', 'дня', 'дней')}`;
    if (hours > 0) return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;

    return `${minutes} мин`;
};

export type WindowHint = {
    /** ok — время есть; warn — мало или вышли за 24 часа; closed — срок прошёл; none — отвечать не на что. */
    tone: 'ok' | 'warn' | 'closed' | 'none';
    remainingMs: number | null;
    text: string;
};

const elapsed = (iso: string | null, nowMs: number): number | null => {
    if (!iso) return null;
    const at = Date.parse(iso);
    if (Number.isNaN(at)) return null;

    return Math.max(0, nowMs - at);
};

/** Окно ответа в Direct: 24 часа от последнего сообщения клиента. */
export const directWindow = (lastInboundAt: string | null, nowMs: number): WindowHint => {
    const since = elapsed(lastInboundAt, nowMs);
    if (since === null) {
        return {
            tone: 'none',
            remainingMs: null,
            text: 'Клиент ещё не писал в Direct. Писать первым Instagram не разрешает.',
        };
    }
    const left = DIRECT_WINDOW_MS - since;
    if (left > 0) {
        return {
            tone: left < 2 * HOUR_MS ? 'warn' : 'ok',
            remainingMs: left,
            text: `На ответ осталось ${humanDuration(left)} из 24 часов.`,
        };
    }
    const humanLeft = HUMAN_AGENT_WINDOW_MS - since;
    if (humanLeft > 0) {
        return {
            tone: 'warn',
            remainingMs: humanLeft,
            text: `24 часа прошли — ответ может не дойти. Живому человеку Instagram разрешает до 7 дней (осталось ${humanDuration(humanLeft)}); как это работает через Wazzup, проверим на пробном периоде.`,
        };
    }

    return {
        tone: 'closed',
        remainingMs: 0,
        text: 'С последнего сообщения клиента прошло больше 7 дней — Instagram, скорее всего, ответ не пропустит.',
    };
};

/** Приватный ответ на комментарий: 7 дней от комментария и только один раз. */
export const privateReplyWindow = (commentAt: string | null, alreadyUsed: boolean, nowMs: number): WindowHint => {
    const since = elapsed(commentAt, nowMs);
    if (since === null) {
        return { tone: 'none', remainingMs: null, text: 'Нет комментария, на который можно ответить.' };
    }
    if (alreadyUsed) {
        return {
            tone: 'closed',
            remainingMs: 0,
            text: 'На этот комментарий уже писали в Direct — Instagram разрешает один приватный ответ.',
        };
    }
    const left = PRIVATE_REPLY_WINDOW_MS - since;
    if (left > 0) {
        return {
            tone: left < DAY_MS ? 'warn' : 'ok',
            remainingMs: left,
            text: `Написать в Direct можно ещё ${humanDuration(left)} из 7 дней, один раз.`,
        };
    }

    return {
        tone: 'closed',
        remainingMs: 0,
        text: 'После комментария прошло больше 7 дней — приватный ответ Instagram, скорее всего, не пропустит.',
    };
};

export const PUBLIC_REPLY_HINT =
    'Ответ с цитатой комментария — по справке Wazzup появится под постом. Проверим на пробном периоде.';

// ─── Комментарии по постам ─────────────────────────────────────────────────

export type PostGroup = {
    key: string;
    src: string | null;
    description: string | null;
    author: string | null;
    chats: ChatRow[];
    /** Сколько авторов под постом ждут ответа. */
    waiting: number;
    lastAt: string | null;
};

const timeOf = (iso: string | null): number => (iso ? Date.parse(iso) || 0 : 0);

/**
 * Комментарии, сгруппированные по посту. Сверху — посты, где кто-то ждёт
 * ответа, дальше — по свежести. Внутри поста — свежие чаты сверху.
 */
export const groupCommentsByPost = (rows: ChatRow[]): PostGroup[] => {
    const groups = new Map<string, PostGroup>();
    for (const row of rows) {
        if (row.kind !== 'comment') continue;
        const key = row.post_id ?? row.post_external_id ?? 'no-post';
        let group = groups.get(key);
        if (!group) {
            group = {
                key,
                src: row.post_src,
                description: row.post_description,
                author: row.post_author,
                chats: [],
                waiting: 0,
                lastAt: null,
            };
            groups.set(key, group);
        }
        group.chats.push(row);
        if (row.waiting_since) group.waiting += 1;
        if (timeOf(row.last_message_at) > timeOf(group.lastAt)) group.lastAt = row.last_message_at;
    }

    const list = [...groups.values()];
    for (const group of list) {
        group.chats.sort((a, b) => timeOf(b.last_message_at) - timeOf(a.last_message_at));
    }

    return list.sort(
        (a, b) => Number(b.waiting > 0) - Number(a.waiting > 0) || timeOf(b.lastAt) - timeOf(a.lastAt),
    );
};

/** Превью подписи поста в одну строку. */
export const postPreview = (description: string | null, max = 120): string => {
    const flat = (description ?? '').replace(/\s+/g, ' ').trim();
    if (!flat) return 'Пост без подписи';

    return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

// ─── Подписи ───────────────────────────────────────────────────────────────

export const chatTitle = (row: Pick<ChatRow, 'contact_name' | 'contact_username' | 'external_chat_id'>): string =>
    row.contact_name ?? (row.contact_username ? `@${row.contact_username}` : `@${row.external_chat_id}`);

/**
 * Строки очереди, которые ещё надо показать в переписке: всё, у чего нет эха
 * среди сообщений чата. Пришло эхо — сообщение уже видно, строка не нужна.
 */
export const visibleOutbox = (rows: OutboxRow[], messageExternalIds: Set<string>): OutboxRow[] =>
    rows.filter((row) => !(row.external_message_id && messageExternalIds.has(row.external_message_id)));

/**
 * «Отправляется» дольше двух минут — это уже не «в пути»: сервер не записал
 * результат (контейнер оборвался). Показываем как «могло уйти».
 */
export const PENDING_STUCK_MS = 2 * 60_000;

export const effectiveOutboxStatus = (row: Pick<OutboxRow, 'status' | 'created_at'>, nowMs: number): OutboxStatus =>
    row.status === 'pending' && nowMs - Date.parse(row.created_at) > PENDING_STUCK_MS ? 'unknown' : row.status;

/** Был ли уже приватный ответ на этот комментарий (кроме неудачных). */
export const privateReplyUsed = (rows: OutboxRow[], refExternalId: string | null): boolean =>
    !!refExternalId &&
    rows.some((row) => row.mode === 'comment_private' && row.status !== 'failed' && row.ref_external_id === refExternalId);

export const outboxLabel = (row: Pick<OutboxRow, 'status' | 'mode'>): string => {
    switch (row.status) {
        case 'pending':
            return 'отправляется…';
        case 'failed':
            return 'не ушло';
        case 'unknown':
            return 'проверьте в Instagram: могло уйти';
        default:
            return row.mode === 'comment_private'
                ? 'отправлено в Direct'
                : row.mode === 'comment_public'
                  ? 'отправлено под постом'
                  : 'отправлено';
    }
};

export const MESSAGE_STATUS_LABELS: Record<string, string> = {
    sent: 'отправлено',
    delivered: 'доставлено',
    read: 'прочитано',
    error: 'ошибка доставки',
};

export const CHANNEL_STATE_LABELS: Record<string, string> = {
    active: 'работает',
    init: 'подключается',
    disabled: 'выключен',
    phoneUnavailable: 'телефон недоступен',
    qridle: 'ждёт QR-код',
    openelsewhere: 'открыт в другом месте',
    notEnoughMoney: 'не оплачен',
    foreignphone: 'чужой номер',
    unauthorized: 'нет авторизации',
    waitForPassword: 'ждёт пароль',
    blocked: 'заблокирован',
    onModeration: 'на модерации',
    rejected: 'отклонён',
};

export const channelStateLabel = (state: string | null): string =>
    state ? (CHANNEL_STATE_LABELS[state] ?? state) : 'неизвестно';

export const isChannelHealthy = (state: string | null): boolean => state === 'active';

/** Время по Москве — как на остальных экранах. */
const MOSCOW = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

export const formatMoment = (iso: string | null): string => {
    if (!iso || Number.isNaN(Date.parse(iso))) return '';
    const parts = MOSCOW.formatToParts(new Date(iso));
    const at = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';

    return `${at('day')}.${at('month')} ${at('hour')}:${at('minute')}`;
};
