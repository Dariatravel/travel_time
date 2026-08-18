import { createServer } from 'node:net';

import { describe, expect, it } from 'vitest';

import { withRetry } from './retry';

/**
 * Проверяем то, из-за чего менеджеры видели вечную загрузку: если обращение к
 * Supabase подвисает, оно должно оборваться по своему сроку и уйти в повтор,
 * а не держаться до предела контейнера в тридцать секунд.
 */
describe('обрыв подвисшего обращения', () => {
    it('подвисший запрос считается временной ошибкой и повторяется', async () => {
        // Сервер принимает соединение и молчит — ровно как подвисший ответ.
        const server = createServer(() => {});
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address() as { port: number };

        let attempts = 0;

        const operation = async () => {
            attempts += 1;

            if (attempts === 1) {
                await fetch(`http://127.0.0.1:${port}/`, {
                    signal: AbortSignal.timeout(300),
                });
            }

            return 'ответ получен';
        };

        const startedAt = Date.now();
        const result = await withRetry(operation, { retries: 2, baseDelayMs: 10 });
        const elapsed = Date.now() - startedAt;

        server.close();

        expect(result).toBe('ответ получен');
        expect(attempts).toBe(2);
        // Уложились в секунду, а не ждали предела контейнера.
        expect(elapsed).toBeLessThan(2_000);
    });

    it('не временную ошибку не повторяет', async () => {
        let attempts = 0;

        const operation = async () => {
            attempts += 1;
            throw new Error('Forbidden gateway path');
        };

        await expect(withRetry(operation, { retries: 2, baseDelayMs: 1 })).rejects.toThrow(
            'Forbidden gateway path',
        );
        expect(attempts).toBe(1);
    });
});
