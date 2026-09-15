/**
 * Прочитать таблицу целиком, страницами.
 *
 * Supabase отдаёт не больше 1 000 строк за запрос (max-rows у PostgREST),
 * и `.limit(50000)` этого не отменяет: приходит первая тысяча, остальное
 * молча теряется. 15.09.2026 из-за этого статистика опроса показывала
 * «отвечено 0» у сотрудников, чьи строки не попали в первую тысячу.
 *
 * Порядок обязателен: без него страницы могут пересекаться.
 */

export const SUPABASE_PAGE = 1000;

export type PageQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export const fetchAll = async <T>(page: PageQuery<T>, pageSize = SUPABASE_PAGE, maxRows = 200_000): Promise<T[]> => {
    const rows: T[] = [];
    for (let from = 0; from < maxRows; from += pageSize) {
        const { data, error } = await page(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        const chunk = data ?? [];
        rows.push(...chunk);
        if (chunk.length < pageSize) break;
    }

    return rows;
};
