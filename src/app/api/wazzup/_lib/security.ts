import { timingSafeEqual } from 'node:crypto';

/**
 * Защита адресов Wazzup. Чистые функции — проверяются тестами.
 *
 * Где у Wazzup задаётся crmKey (он присылает его как Bearer), документация
 * не говорит. Поэтому адрес вебхука защищён нашим токеном в query
 * (?token=...), а Bearer с тем же токеном тоже принимается.
 */

export const constantEquals = (a: string, b: string): boolean => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    return left.length === right.length && timingSafeEqual(left, right);
};

export const bearerOf = (authorization: string | null | undefined): string | null => {
    const match = /^Bearer\s+(.+)$/i.exec((authorization ?? '').trim());

    return match ? match[1].trim() : null;
};

/**
 * Токен подошёл хотя бы в одном из мест: query, Bearer, заголовок.
 * Проверяем все без раннего выхода. Токен не задан — не пускаем никого.
 */
export const tokenMatches = (
    expected: string | undefined,
    given: { query?: string | null; authorization?: string | null; header?: string | null },
): boolean => {
    if (!expected) return false;
    const candidates = [given.query, bearerOf(given.authorization), given.header].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
    );
    let ok = false;
    for (const candidate of candidates) ok = constantEquals(expected, candidate) || ok;

    return ok;
};

const SKIP_HEADERS = new Set(['cookie', 'authorization', 'proxy-authorization', 'x-wazzup-token', 'x-oko-token']);

/**
 * Заголовки для журнала — без секретов. Шлюз может переложить исходный адрес
 * (с ?token=) в свой заголовок, поэтому токен вырезается и из значений.
 */
export const sanitizeHeaders = (
    entries: Iterable<[string, string]>,
    secrets: (string | undefined)[],
): Record<string, string> => {
    const result: Record<string, string> = {};
    const known = secrets.filter((s): s is string => !!s && s.length >= 4);
    for (const [key, value] of entries) {
        const name = key.toLowerCase();
        if (SKIP_HEADERS.has(name)) continue;
        let clean = value.replace(/([?&]token=)[^&#\s]*/gi, '$1***');
        for (const secret of known) clean = clean.split(secret).join('***');
        result[name] = clean.slice(0, 300);
    }

    return result;
};

export const maskToken = (url: string): string => url.replace(/([?&]token=)[^&#]*/gi, '$1***');

/** Wazzup принимает адрес вебхука не длиннее 200 символов. */
export const WEBHOOK_URI_MAX = 200;

/**
 * Публичный адрес программы — только из WAZZUP_WEBHOOK_BASE_URL. Из заголовков
 * запроса его не берём: их можно подделать, и вебхук аккаунта ушёл бы не туда.
 * Разрешён только https без параметров.
 */
export const webhookBaseUrl = (value: string | undefined): string | null => {
    const raw = value?.trim();
    if (!raw) return null;
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) return null;

        return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    } catch {
        return null;
    }
};

export const buildWebhookUrl = (base: string, token: string): string =>
    `${base.replace(/\/+$/, '')}/api/wazzup/webhook?token=${encodeURIComponent(token)}`;

/**
 * Тот же ли это наш адрес: сравниваем без параметров (токен мог смениться).
 * Непонятный адрес — не наш.
 */
export const sameWebhookTarget = (current: string, ours: string): boolean => {
    try {
        const a = new URL(current);
        const b = new URL(ours);

        return a.origin === b.origin && a.pathname.replace(/\/+$/, '') === b.pathname.replace(/\/+$/, '');
    } catch {
        return false;
    }
};

/**
 * Чужой адрес для показа человеку: домен и начало пути, без параметров —
 * в них у чужой системы может быть её ключ.
 */
export const maskForeignUri = (uri: string, pathChars = 12): string => {
    try {
        const url = new URL(uri);
        const path = url.pathname === '/' ? '' : url.pathname;

        return `${url.host}${path.slice(0, pathChars)}${path.length > pathChars ? '…' : ''}`;
    } catch {
        const head = uri.split(/[?#]/)[0].replace(/^[a-z]+:\/\//i, '');

        return `${head.slice(0, 24)}${head.length > 24 ? '…' : ''}`;
    }
};
