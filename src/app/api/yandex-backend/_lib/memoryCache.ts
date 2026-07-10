type CacheEntry<T> = {
    value: T;
    expiresAt: number;
};

/**
 * Жёсткий потолок записей: ключи включают хэш авторизации (запись на
 * пользователя × отель), а протухшие записи раньше удалялись только при
 * чтении того же ключа — в долгоживущем контейнере кэш рос бесконечно.
 */
const MAX_CACHE_ENTRIES = 500;

const cache = new Map<string, CacheEntry<unknown>>();

const evictExpiredEntries = (now: number) => {
    for (const [key, entry] of cache) {
        if (entry.expiresAt <= now) {
            cache.delete(key);
        }
    }
};

export const getCached = <T>(key: string): T | undefined => {
    const entry = cache.get(key);

    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return undefined;
    }

    return entry.value as T;
};

export const setCached = <T>(key: string, value: T, ttlMs: number) => {
    const now = Date.now();

    if (cache.size >= MAX_CACHE_ENTRIES) {
        evictExpiredEntries(now);
    }

    // Если и после чистки протухших мест нет — вытесняем самые старые записи
    // (Map хранит порядок вставки).
    while (cache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey === undefined) break;
        cache.delete(oldestKey);
    }

    cache.set(key, {
        value,
        expiresAt: now + ttlMs,
    });
};

export const deleteCacheByPrefix = (prefix: string) => {
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
            cache.delete(key);
        }
    }
};
