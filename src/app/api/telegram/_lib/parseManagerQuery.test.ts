import { describe, expect, it } from 'vitest';

import { parseManagerQuery } from './parseManagerQuery';

const TODAY = new Date('2026-08-08T00:00:00Z');

describe('parseManagerQuery', () => {
    it('разбирает «Гагра 12-16 августа 4 человека»', () => {
        expect(parseManagerQuery('Гагра 12-16 августа 4 человека', TODAY)).toEqual({
            startDate: '2026-08-12',
            endDate: '2026-08-16',
            cities: ['gagra'],
            guests: 4,
        });
    });

    it('разбирает даты с точками и без города', () => {
        expect(parseManagerQuery('12.08-16.08', TODAY)).toEqual({
            startDate: '2026-08-12',
            endDate: '2026-08-16',
            cities: [],
            guests: null,
        });
    });

    it('понимает «с 12 по 16 августа»', () => {
        const query = parseManagerQuery('с 12 по 16 августа Пицунда', TODAY);

        expect(query?.startDate).toBe('2026-08-12');
        expect(query?.endDate).toBe('2026-08-16');
        expect(query?.cities).toEqual(['pitsunda']);
    });

    it('берёт месяц первой даты, если у второй он не указан', () => {
        const query = parseManagerQuery('20.08-25', TODAY);

        expect(query?.startDate).toBe('2026-08-20');
        expect(query?.endDate).toBe('2026-08-25');
    });

    it('переносит выезд на следующий год для периода через новый год', () => {
        const query = parseManagerQuery('28.12-04.01', TODAY);

        expect(query?.startDate).toBe('2026-12-28');
        expect(query?.endDate).toBe('2027-01-04');
    });

    it('считает прошедшую дату следующим годом', () => {
        const query = parseManagerQuery('10.03-15.03', TODAY);

        expect(query?.startDate).toBe('2027-03-10');
    });

    it('не путает число гостей с числами из дат', () => {
        const query = parseManagerQuery('12-16 августа на 3 человека', TODAY);

        expect(query?.guests).toBe(3);
    });

    it('узнаёт Афон и Лидзаву', () => {
        expect(parseManagerQuery('Афон 12-16 августа', TODAY)?.cities).toEqual(['new-athon']);
        expect(parseManagerQuery('Лидзава 12-16 августа', TODAY)?.cities).toEqual(['ldzaa']);
    });

    it('игнорирует команду перед текстом', () => {
        const query = parseManagerQuery('/free Сухум 12-16 августа', TODAY);

        expect(query?.cities).toEqual(['sukhumi']);
        expect(query?.startDate).toBe('2026-08-12');
    });

    it('возвращает null, если дат нет', () => {
        expect(parseManagerQuery('Добрый день!', TODAY)).toBeNull();
    });

    it('возвращает null, если выезд раньше заезда в том же месяце', () => {
        expect(parseManagerQuery('16.08-12.08', TODAY)).toBeNull();
    });
});
