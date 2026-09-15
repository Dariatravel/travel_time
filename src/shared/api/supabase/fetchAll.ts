/**
 * Прочитать таблицу целиком, страницами.
 *
 * Supabase отдаёт не больше 1 000 строк за запрос (max-rows у PostgREST),
 * и `.limit(50000)` этого не отменяет: приходит первая тысяча, остальное
 * молча теряется. 15.09.2026 из-за этого статистика опроса показывала
 * «отвечено 0» у сотрудников, чьи строки не попали в первую тысячу.
 *
 * Останавливаемся только на ПУСТОЙ странице: если бы стоп был по «страница
 * короче ожидаемой», то серверный лимит меньше нашего размера страницы
 * повторил бы ту же ошибку. Цена — один лишний запрос в конце.
 *
 * Порядок обязателен: без него страницы могут пересекаться. Если между
 * запросами кто-то вставил строку, страницы сдвигаются — `key` убирает
 * возникшие дубли.
 */

export const SUPABASE_PAGE = 1000;

export type PageQuery<T> = (
    from: number,
    to: number,
) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export const fetchAll = async <T>(
    page: PageQuery<T>,
    options: { pageSize?: number; maxRows?: number; key?: (row: T) => string } = {},
): Promise<T[]> => {
    const pageSize = options.pageSize ?? SUPABASE_PAGE;
    const maxRows = options.maxRows ?? 200_000;
    const rows: T[] = [];
    const seen = new Set<string>();
    // Сдвигаемся на столько строк, сколько реально пришло: если сервер режет
    // страницу короче нашей, следующая начнётся ровно там, где кончилась эта.
    let from = 0;
    for (;;) {
        if (from >= maxRows) throw new Error(`Слишком много строк: больше ${maxRows}`);
        const { data, error } = await page(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        const chunk = data ?? [];
        if (chunk.length === 0) break;
        for (const row of chunk) {
            if (options.key) {
                const k = options.key(row);
                if (seen.has(k)) continue;
                seen.add(k);
            }
            rows.push(row);
        }
        from += chunk.length;
    }

    return rows;
};
