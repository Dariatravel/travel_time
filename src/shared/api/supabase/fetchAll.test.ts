import { describe, expect, it } from 'vitest';

import { fetchAll } from './fetchAll';

const source = (total: number) => {
    const calls: [number, number][] = [];
    const page = async (from: number, to: number) => {
        calls.push([from, to]);
        const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i);

        return { data, error: null };
    };

    return { page, calls };
};

describe('чтение таблицы страницами', () => {
    it('собирает всё, когда строк больше одной страницы', async () => {
        const { page, calls } = source(2_345);
        const rows = await fetchAll(page, 1000);
        expect(rows).toHaveLength(2_345);
        expect(rows[2_344]).toBe(2_344);
        expect(calls).toEqual([
            [0, 999],
            [1000, 1999],
            [2000, 2999],
        ]);
    });

    it('ровно страница — делает ещё один запрос и останавливается на пустом', async () => {
        const { page, calls } = source(1000);
        expect(await fetchAll(page, 1000)).toHaveLength(1000);
        expect(calls).toHaveLength(2);
    });

    it('пусто и меньше страницы — один запрос', async () => {
        expect(await fetchAll(source(0).page, 1000)).toEqual([]);
        const { page, calls } = source(7);
        expect(await fetchAll(page, 1000)).toHaveLength(7);
        expect(calls).toHaveLength(1);
    });

    it('ошибка страницы поднимается наверх', async () => {
        await expect(fetchAll(async () => ({ data: null, error: { message: 'нет доступа' } }))).rejects.toThrow('нет доступа');
    });
});
