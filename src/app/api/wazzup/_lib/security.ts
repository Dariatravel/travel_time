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

const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/**
 * Публичный адрес программы. Своей переменной с адресом в проекте нет, поэтому:
 * WAZZUP_WEBHOOK_BASE_URL, если задана, иначе заголовки шлюза, иначе адрес запроса.
 */
export const publicBaseUrl = (
    override: string | undefined,
    header: (name: string) => string | null,
    fallbackOrigin: string,
): string => {
    if (override && override.trim()) return override.trim().replace(/\/+$/, '');
    const host = (header('x-forwarded-host') ?? header('host') ?? '').split(',')[0].trim();
    const protoRaw = (header('x-forwarded-proto') ?? '').split(',')[0].trim().toLowerCase();
    const proto = protoRaw === 'http' || protoRaw === 'https' ? protoRaw : fallbackOrigin.startsWith('http:') ? 'http' : 'https';
    if (host && HOST_RE.test(host)) return `${proto}://${host}`;

    return fallbackOrigin.replace(/\/+$/, '');
};

export const buildWebhookUrl = (base: string, token: string): string =>
    `${base.replace(/\/+$/, '')}/api/wazzup/webhook?token=${encodeURIComponent(token)}`;
