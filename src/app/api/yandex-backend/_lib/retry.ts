const TRANSIENT_STATUS_CODES = new Set(['408', '429', '500', '502', '503', '504']);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientError = (error: unknown) => {
    if (!error || typeof error !== 'object') return false;

    const maybeError = error as { code?: string; status?: number; message?: string };
    if (maybeError.status && maybeError.status >= 500) return true;
    if (maybeError.code && TRANSIENT_STATUS_CODES.has(maybeError.code)) return true;

    const message = maybeError.message?.toLowerCase() ?? '';
    return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('fetch failed') ||
        message.includes('connection')
    );
};

export async function withRetry<T>(
    operation: () => Promise<T>,
    options: { retries?: number; baseDelayMs?: number } = {},
) {
    const retries = options.retries ?? 2;
    const baseDelayMs = options.baseDelayMs ?? 250;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt === retries || !isTransientError(error)) {
                throw error;
            }

            await sleep(baseDelayMs * 2 ** attempt);
        }
    }

    throw lastError;
}
