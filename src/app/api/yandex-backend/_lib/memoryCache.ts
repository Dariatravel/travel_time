type CacheEntry<T> = {
    value: T;
    expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

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
    cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
    });
};

export const deleteCacheByPrefix = (prefix: string) => {
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
            cache.delete(key);
        }
    }
};
