import { describe, expect, it } from 'vitest';

import { cleanInternal, cleanPublic, completeness, draftChanges, emptyPublic, parseTags, PUBLIC_KEYS, withDraft } from './objectCard';

describe('удобства через запятую', () => {
    it('режет, чистит пустые и повторы', () => {
        expect(parseTags(' Wi-Fi, парковка;, wi-fi ,\nбассейн ')).toEqual(['Wi-Fi', 'парковка', 'бассейн']);
    });

    it('не больше 30 штук и 60 знаков', () => {
        const many = Array.from({ length: 40 }, (_, i) => `т${i}`).join(',');
        expect(parseTags(many)).toHaveLength(30);
        expect(parseTags('а'.repeat(100))[0]).toHaveLength(60);
    });
});

describe('очистка публичной части перед отправкой', () => {
    it('пустое → null, пробелы срезаны, чужие поля не проходят', () => {
        const out = cleanPublic({ summary: '  У моря ', checkin: '   ', tariff: 'exclusive' } as never);
        expect(out).toEqual({ summary: 'У моря', checkin: null });
        expect(Object.keys(out).every((k) => (PUBLIC_KEYS as string[]).includes(k))).toBe(true);
    });

    it('минимум ночей — только целое от 1 до 60', () => {
        expect(cleanPublic({ min_nights: '3' }).min_nights).toBe(3);
        expect(cleanPublic({ min_nights: 999 }).min_nights).toBeNull();
        expect(cleanPublic({ min_nights: 2.5 }).min_nights).toBeNull();
        expect(cleanPublic({ min_nights: '' }).min_nights).toBeNull();
    });

    it('удобства принимаются и строкой, и массивом', () => {
        expect(cleanPublic({ amenities: 'Wi-Fi, парковка' }).amenities).toEqual(['Wi-Fi', 'парковка']);
        expect(cleanPublic({ amenities: ['бассейн', 'бассейн'] }).amenities).toEqual(['бассейн']);
    });

    it('длинный текст обрезается до 4000', () => {
        expect(cleanPublic({ description: 'x'.repeat(5000) }).description).toHaveLength(4000);
    });
});

describe('правка отельера', () => {
    const current = { ...emptyPublic(), summary: 'Старый текст', amenities: ['Wi-Fi'] };

    it('показывает только реально изменившиеся поля', () => {
        const changes = draftChanges(current, { summary: 'Старый текст', kids: 'до 5 лет бесплатно', amenities: ['Wi-Fi'] });
        expect(changes).toEqual([{ key: 'kids', label: 'Дети', before: '—', after: 'до 5 лет бесплатно' }]);
    });

    it('без правки — пусто; правка поверх карточки — для формы отельера', () => {
        expect(draftChanges(current, null)).toEqual([]);
        expect(withDraft(current, { summary: 'Новый' }).summary).toBe('Новый');
        expect(withDraft(current, null)).toBe(current);
    });
});

describe('заполненность и внутреннее', () => {
    it('доля заполненных публичных полей', () => {
        expect(completeness(emptyPublic())).toBe(0);
        expect(completeness({ ...emptyPublic(), summary: 'x', amenities: ['y'] })).toBeCloseTo(2 / 14, 5);
    });

    it('внутренние поля: неизвестный тариф → базовый, дата только ISO', () => {
        expect(cleanInternal({ tariff: 'vip' as never, checked_at: '16.09.2026', owner_contact: ' Олег ' })).toEqual({
            tariff: 'basic',
            owner_contact: 'Олег',
            prepay_terms: null,
            internal_note: null,
            checked_at: null,
        });
        expect(cleanInternal({ tariff: 'exclusive', checked_at: '2026-09-16' }).checked_at).toBe('2026-09-16');
    });
});
