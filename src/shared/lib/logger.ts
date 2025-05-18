/**
 * Утилита для логирования только в development режиме
 * @param message - Сообщение для логирования
 * @param data - Дополнительные данные для логирования
 */
export const devLog = (message: string, ...data: unknown[]): void => {
    if (process.env.MODE === 'development') {
        console.log(`[DEV] ${message}`, ...data);
    }
};

/**
 * Утилита для логирования ошибок только в development режиме
 * @param message - Сообщение об ошибке
 * @param error - Объект ошибки
 */
export const devError = (message: string, error?: unknown): void => {
    if (process.env.MODE === 'development') {
        console.error(`[DEV ERROR] ${message}`, error);
    }
};

/**
 * Утилита для логирования предупреждений только в development режиме
 * @param message - Сообщение с предупреждением
 * @param data - Дополнительные данные
 */
export const devWarn = (message: string, ...data: unknown[]): void => {
    if (process.env.MODE === 'development') {
        console.warn(`[DEV WARN] ${message}`, ...data);
    }
};
