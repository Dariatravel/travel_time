import { describe, expect, it } from 'vitest';

import { parsePriceFilters } from '@/shared/lib/priceFilters';

describe('parsePriceFilters', () => {
    it('пустой или null-фильтр даёт обе границы null', () => {
        expect(parsePriceFilters(null)).toEqual({ min_price: null, max_price: null });
        expect(parsePriceFilters([])).toEqual({ min_price: null, max_price: null });
    });

    it('"up-to-N" задаёт потолок цены', () => {
        expect(parsePriceFilters(['up-to-5000'])).toEqual({ min_price: null, max_price: 5000 });
    });

    it('"over-N" задаёт пол цены', () => {
        expect(parsePriceFilters(['over-3000'])).toEqual({ min_price: 3000, max_price: null });
    });

    it('из нескольких потолков берётся самый низкий', () => {
        expect(parsePriceFilters(['up-to-5000', 'up-to-3000']).max_price).toBe(3000);
    });

    it('из нескольких полов берётся самый высокий', () => {
        expect(parsePriceFilters(['over-3000', 'over-4500']).min_price).toBe(4500);
    });

    it('совмещает пол и потолок', () => {
        expect(parsePriceFilters(['over-3000', 'up-to-8000'])).toEqual({
            min_price: 3000,
            max_price: 8000,
        });
    });

    it('нераспознанные строки игнорируются', () => {
        expect(parsePriceFilters(['any', 'up-to-abc', 'up-to-5000'])).toEqual({
            min_price: null,
            max_price: 5000,
        });
    });
});
