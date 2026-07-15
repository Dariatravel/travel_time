/**
 * Разбор ценовых фильтров расширенного поиска в границы min/max.
 *
 * Значения приходят строками вида "up-to-5000" (потолок цены) и "over-3000"
 * (пол цены). Может прийти несколько: для max берём самый низкий потолок,
 * для min — самый высокий пол (наиболее строгие рамки).
 */
export function parsePriceFilters(priceFilters: string[] | null): {
    min_price: number | null;
    max_price: number | null;
} {
    if (!priceFilters || priceFilters.length === 0) {
        return { min_price: null, max_price: null };
    }

    let minPrice: number | null = null;
    let maxPrice: number | null = null;

    priceFilters.forEach((filter) => {
        if (filter.startsWith('up-to-')) {
            const value = parseInt(filter.replace('up-to-', ''), 10);
            if (!isNaN(value)) {
                if (maxPrice === null || value < maxPrice) {
                    maxPrice = value;
                }
            }
        } else if (filter.startsWith('over-')) {
            const value = parseInt(filter.replace('over-', ''), 10);
            if (!isNaN(value)) {
                if (minPrice === null || value > minPrice) {
                    minPrice = value;
                }
            }
        }
    });

    return { min_price: minPrice, max_price: maxPrice };
}
