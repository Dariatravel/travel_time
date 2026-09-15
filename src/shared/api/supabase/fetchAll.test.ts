import { describe, expect, it } from 'vitest';

import { fetchAll } from './fetchAll';

/** Источник на `total` строк; `serverMax` — потолок сервера за один запрос. */
const source = (total: number, serverMax = Infinity) => {
    const calls: [number, number][] = [];
    const page = async (from: number, to: number) => {
        calls.push([from, to]);
        const last = Math.min(to, from + serverMax - 1, total - 1);
        const data = Array.from({ length: Math.max(0, last - from + 1) }, (_, i) => from + i);

        return { data, error: null };
    };

    return { page, calls };
};

describe('чтение таблицы страницами', () => {
    it('собирает всё, когда строк больше одной страницы', async () => {
        const { page, calls } = source(2_345);
        const rows = await fetchAll(page);
        expect(rows).toHaveLength(2_345);
        expect(rows[2_344]).toBe(2_344);
        expect(calls).toEqual([
            [0, 999],
            [1000, 1999],
            [2000, 2999],
            [2345, 3344],
        ]);
    });

    it('останавливается только на пустой странице', async () => {
        const { page, calls } = source(1000);
        expect(await fetchAll(page)).toHaveLength(1000);
        expect(calls).toHaveLength(2);
        expect(await fetchAll(source(0).page)).toEqual([]);
        const short = source(7);
        expect(await fetchAll(short.page)).toHaveLength(7);
        expect(short.calls).toEqual([
            [0, 999],
            [7, 1006],
        ]);
    });

    it('серверный потолок меньше нашей страницы — всё равно дочитывает до конца', async () => {
        // Та самая ловушка: сервер отдаёт по 300, мы просим по 1000.
        const { page } = source(2_500, 300);
        expect(await fetchAll(page)).toHaveLength(2_500);
    });

    it('строка, вставленная между запросами, не даёт дублей — по ключу', async () => {
        const original = Array.from({ length: 40 }, (_, i) => i);
        let call = 0;
        const page = async (from: number, to: number) => {
            call += 1;
            // После первой страницы кто-то вставил строку в начало: всё сдвинулось.
            const table = call >= 2 ? [-1, ...original] : original;

            return { data: table.slice(from, to + 1), error: null };
        };
        const rows = await fetchAll(page, { pageSize: 20, key: (n) => String(n) });
        expect(new Set(rows).size).toBe(rows.length);
        expect(rows.filter((n) => n >= 0)).toHaveLength(40);
    });

    it('ошибка страницы и переполнение поднимаются наверх', async () => {
        await expect(
            fetchAll(async () => ({ data: null, error: { message: 'нет доступа' } })),
        ).rejects.toThrow('нет доступа');
        await expect(fetchAll(source(5_000).page, { maxRows: 2_000 })).rejects.toThrow(
            'Слишком много строк',
        );
    });
});
