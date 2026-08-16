/// <reference lib="deno.ns" />

import { assertEquals } from 'jsr:@std/assert@1.0.14';

import { parseManagerQuery } from './parseManagerQuery.ts';

const TODAY = new Date('2026-08-08T00:00:00Z');

Deno.test('разбирает «Гагра 12-16 августа 4 человека»', () => {
    assertEquals(parseManagerQuery('Гагра 12-16 августа 4 человека', TODAY), {
        startDate: '2026-08-12',
        endDate: '2026-08-16',
        cities: ['gagra'],
        guests: 4,
        isPast: false,
    });
});

Deno.test('разбирает даты с точками и без города', () => {
    assertEquals(parseManagerQuery('12.08-16.08', TODAY), {
        startDate: '2026-08-12',
        endDate: '2026-08-16',
        cities: [],
        guests: null,
        isPast: false,
    });
});

Deno.test('понимает «с 12 по 16 августа»', () => {
    const query = parseManagerQuery('с 12 по 16 августа Пицунда', TODAY);

    assertEquals(query?.startDate, '2026-08-12');
    assertEquals(query?.endDate, '2026-08-16');
    assertEquals(query?.cities, ['pitsunda']);
});

Deno.test('берёт месяц первой даты, если у второй он не указан', () => {
    const query = parseManagerQuery('20.08-25', TODAY);

    assertEquals(query?.startDate, '2026-08-20');
    assertEquals(query?.endDate, '2026-08-25');
});

Deno.test('переносит выезд на следующий год для периода через новый год', () => {
    const query = parseManagerQuery('28.12-04.01', TODAY);

    assertEquals(query?.startDate, '2026-12-28');
    assertEquals(query?.endDate, '2027-01-04');
});

Deno.test('считает прошедшую дату следующим годом', () => {
    const query = parseManagerQuery('10.03-15.03', TODAY);

    assertEquals(query?.startDate, '2027-03-10');
});

Deno.test('не путает число гостей с числами из дат', () => {
    const query = parseManagerQuery('12-16 августа на 3 человека', TODAY);

    assertEquals(query?.guests, 3);
});

Deno.test('узнаёт Афон и Лидзаву', () => {
    assertEquals(parseManagerQuery('Афон 12-16 августа', TODAY)?.cities, ['new-athon']);
    assertEquals(parseManagerQuery('Лидзава 12-16 августа', TODAY)?.cities, ['ldzaa']);
});

Deno.test('понимает несколько городов через запятую', () => {
    const query = parseManagerQuery('Гагра, Пицунда, Лдзаа 12-16 августа', TODAY);

    assertEquals(query?.cities, ['ldzaa', 'pitsunda', 'gagra']);
});

Deno.test('не спотыкается о падежи', () => {
    assertEquals(parseManagerQuery('в Гагре 12-16 августа', TODAY)?.cities, ['gagra']);
    assertEquals(parseManagerQuery('по Пицунде 12-16 августа', TODAY)?.cities, ['pitsunda']);
    assertEquals(parseManagerQuery('Сухуме 12-16 августа', TODAY)?.cities, ['sukhumi']);
    assertEquals(parseManagerQuery('Гудауте 12-16 августа', TODAY)?.cities, ['gudauta']);
    assertEquals(parseManagerQuery('Алахадзах 12-16 августа', TODAY)?.cities, ['alahadzy']);
});

Deno.test('по слову «везде» берёт все города', () => {
    const query = parseManagerQuery('везде 12-16 августа', TODAY);

    assertEquals(query?.cities.length, 8);
});

Deno.test('оставляет города пустыми, если город не назван', () => {
    assertEquals(parseManagerQuery('12-16 августа', TODAY)?.cities, []);
});

Deno.test('игнорирует команду перед текстом', () => {
    const query = parseManagerQuery('/free Сухум 12-16 августа', TODAY);

    assertEquals(query?.cities, ['sukhumi']);
    assertEquals(query?.startDate, '2026-08-12');
});

Deno.test('возвращает null, если дат нет', () => {
    assertEquals(parseManagerQuery('Добрый день!', TODAY), null);
});

Deno.test('возвращает null, если выезд раньше заезда в том же месяце', () => {
    assertEquals(parseManagerQuery('16.08-12.08', TODAY), null);
});

Deno.test('понимает «завтра»', () => {
    const query = parseManagerQuery('Гагра завтра', TODAY);

    assertEquals(query?.startDate, '2026-08-09');
    assertEquals(query?.endDate, '2026-08-10');
});

Deno.test('понимает «на выходные» — с пятницы по воскресенье', () => {
    const query = parseManagerQuery('Пицунда на выходные', TODAY);

    assertEquals(query?.startDate, '2026-08-14');
    assertEquals(query?.endDate, '2026-08-16');
});

Deno.test('понимает «на 5 ночей»', () => {
    const query = parseManagerQuery('Сухум на 5 ночей', TODAY);

    assertEquals(query?.startDate, '2026-08-08');
    assertEquals(query?.endDate, '2026-08-13');
});

Deno.test('точные даты важнее слова «завтра»', () => {
    const query = parseManagerQuery('завтра нужно на 20-25 августа Гагра', TODAY);

    assertEquals(query?.startDate, '2026-08-20');
    assertEquals(query?.endDate, '2026-08-25');
});

Deno.test('помечает прошедшие даты', () => {
    const query = parseManagerQuery('Гагра 01.08-05.08', TODAY);

    assertEquals(query?.isPast, true);
});

Deno.test('сегодняшний заезд прошедшим не считается', () => {
    const query = parseManagerQuery('Гагра 08.08-12.08', TODAY);

    assertEquals(query?.isPast, false);
});
