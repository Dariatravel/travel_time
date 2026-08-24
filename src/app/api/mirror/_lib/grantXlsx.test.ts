import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';

import { normalizeGrantRoomLabel, parseGrantWorkbook } from './grantXlsx';

type Merge = { s: { r: number; c: number }; e: { r: number; c: number } };

/**
 * Собирает книгу той же формы, что сетка отельера: строка 2 — месяц
 * (объединён на весь месяц), строка 3 — числа, столбец A — раздел,
 * столбец B — название номера, дальше дни.
 */
const buildWorkbook = (
    months: Array<{ name: string; days: number }>,
    rows: Array<{ section?: string; label?: string }>,
    merges: Merge[],
    cells: Array<{ r: number; c: number; v: string }> = [],
): Buffer => {
    const aoa: unknown[][] = [['ГРАНТ ОТЕЛЬ']];

    const monthRow: unknown[] = ['', ''];
    const dayRow: unknown[] = ['', ''];
    const monthMerges: Merge[] = [];
    let col = 2;
    for (const month of months) {
        monthMerges.push({ s: { r: 1, c: col }, e: { r: 1, c: col + month.days - 1 } });
        for (let d = 1; d <= month.days; d += 1) {
            monthRow.push(d === 1 ? month.name : '');
            dayRow.push(d);
            col += 1;
        }
    }
    aoa.push(monthRow, dayRow);

    for (const row of rows) aoa.push([row.section ?? '', row.label ?? '']);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (const cell of cells) {
        ws[XLSX.utils.encode_cell({ r: cell.r, c: cell.c })] = { t: 's', v: cell.v };
    }
    ws['!merges'] = [...monthMerges, ...merges];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Лист1');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

const iso = (unix: number) => new Date(unix * 1000).toISOString();

describe('normalizeGrantRoomLabel', () => {
    it('сводит разное написание пробелов к одному ключу', () => {
        expect(normalizeGrantRoomLabel('3 ч Д № 7')).toBe(normalizeGrantRoomLabel('3ч Д №7'));
        expect(normalizeGrantRoomLabel('  101 2х ')).toBe('1012х');
    });

    it('различает разные номера', () => {
        expect(normalizeGrantRoomLabel('3 ч №6')).not.toBe(normalizeGrantRoomLabel('3 ч №7'));
    });
});

describe('parseGrantWorkbook', () => {
    it('объединённая ячейка = ночи, выезд на день позже последней ночи', () => {
        // Май: номер занят 3-5 числа (три ночи), выезд 6-го.
        const buffer = buildWorkbook(
            [{ name: 'май', days: 10 }],
            [{ section: '1 ЭТАЖ Стд', label: 'стд №1' }],
            [{ s: { r: 3, c: 4 }, e: { r: 3, c: 6 } }],
            [{ r: 3, c: 4, v: 'иванов 2ч' }],
        );

        const { stays } = parseGrantWorkbook(buffer, { year: 2026 });

        expect(stays).toHaveLength(1);
        expect(stays[0].roomLabel).toBe('стд №1');
        // Заезд 14:00 МСК = 11:00 UTC, выезд 12:00 МСК = 09:00 UTC.
        expect(iso(stays[0].start)).toBe('2026-05-03T11:00:00.000Z');
        expect(iso(stays[0].end)).toBe('2026-05-06T09:00:00.000Z');
    });

    it('день выезда остаётся свободным: соседняя бронь начинается в тот же день', () => {
        const buffer = buildWorkbook(
            [{ name: 'май', days: 10 }],
            [{ section: '1 ЭТАЖ Стд', label: 'стд №1' }],
            [
                { s: { r: 3, c: 4 }, e: { r: 3, c: 6 } },
                { s: { r: 3, c: 7 }, e: { r: 3, c: 8 } },
            ],
            [
                { r: 3, c: 4, v: 'иванов' },
                { r: 3, c: 7, v: 'петров' },
            ],
        );

        const { stays } = parseGrantWorkbook(buffer, { year: 2026 });
        const sorted = [...stays].sort((a, b) => a.start - b.start);

        expect(sorted).toHaveLength(2);
        // Выезд первого и заезд второго — 6 мая: ночи не пересекаются.
        expect(iso(sorted[0].end)).toBe('2026-05-06T09:00:00.000Z');
        expect(iso(sorted[1].start)).toBe('2026-05-06T11:00:00.000Z');
    });

    it('пустая ячейка после брони (фиолетовый квадрат выезда) не создаёт занятость', () => {
        const buffer = buildWorkbook(
            [{ name: 'май', days: 10 }],
            [{ section: '1 ЭТАЖ Стд', label: 'стд №1' }],
            [{ s: { r: 3, c: 4 }, e: { r: 3, c: 6 } }],
            [
                { r: 3, c: 4, v: 'иванов' },
                { r: 3, c: 7, v: '' },
            ],
        );

        const { stays } = parseGrantWorkbook(buffer, { year: 2026 });

        expect(stays).toHaveLength(1);
        expect(iso(stays[0].end)).toBe('2026-05-06T09:00:00.000Z');
    });

    it('объединение по вертикали = бронь сразу на несколько номеров', () => {
        const buffer = buildWorkbook(
            [{ name: 'май', days: 10 }],
            [
                { section: 'Коттедж (доп)', label: 'Д №3' },
                { label: 'Д №4' },
            ],
            [{ s: { r: 3, c: 4 }, e: { r: 4, c: 6 } }],
            [{ r: 3, c: 4, v: 'захарова 8ч' }],
        );

        const { stays } = parseGrantWorkbook(buffer, { year: 2026 });

        expect(stays.map((stay) => stay.roomLabel).sort()).toEqual(['Д №3', 'Д №4']);
        expect(new Set(stays.map((stay) => stay.end)).size).toBe(1);
    });

    it('бронь на одну ночь — одиночная ячейка с текстом', () => {
        const buffer = buildWorkbook(
            [{ name: 'май', days: 10 }],
            [{ section: '1 ЭТАЖ Стд', label: 'стд №1' }],
            [],
            [{ r: 3, c: 4, v: 'елена' }],
        );

        const { stays } = parseGrantWorkbook(buffer, { year: 2026 });

        expect(stays).toHaveLength(1);
        expect(iso(stays[0].start)).toBe('2026-05-03T11:00:00.000Z');
        expect(iso(stays[0].end)).toBe('2026-05-04T09:00:00.000Z');
    });

    it('раздел «Эконом» не переносим — отель его нам не продаёт', () => {
        const buffer = buildWorkbook(
            [{ name: 'май', days: 10 }],
            [
                { section: '1 ЭТАЖ Стд', label: 'стд №1' },
                { section: 'Эконом', label: '1' },
                { label: '2 (3 кровати)' },
            ],
            [
                { s: { r: 3, c: 4 }, e: { r: 3, c: 5 } },
                { s: { r: 4, c: 4 }, e: { r: 4, c: 5 } },
                { s: { r: 5, c: 4 }, e: { r: 5, c: 5 } },
            ],
            [
                { r: 3, c: 4, v: 'иванов' },
                { r: 4, c: 4, v: 'эконом-гость' },
                { r: 5, c: 4, v: 'эконом-гость 2' },
            ],
        );

        const { stays, roomLabels } = parseGrantWorkbook(buffer, { year: 2026 });

        expect(roomLabels).toEqual(['стд №1']);
        expect(stays).toHaveLength(1);
    });

    it('сетка переходит на следующий год, когда номер месяца пошёл на убыль', () => {
        const buffer = buildWorkbook(
            [
                { name: 'декабрь', days: 31 },
                { name: 'январь', days: 31 },
            ],
            [{ section: '1 ЭТАЖ Стд', label: 'стд №1' }],
            [{ s: { r: 3, c: 34 }, e: { r: 3, c: 35 } }],
            [{ r: 3, c: 34, v: 'новогодние' }],
        );

        const { stays } = parseGrantWorkbook(buffer, { year: 2026 });

        // Столбец 34 — это 2 января следующего года.
        expect(iso(stays[0].start)).toBe('2027-01-02T11:00:00.000Z');
    });

    it('книга без шапки дат — это ошибка, а не «отель свободен»', () => {
        const ws = XLSX.utils.aoa_to_sheet([['ГРАНТ'], [''], ['']]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Лист1');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

        expect(() => parseGrantWorkbook(buffer, { year: 2026 })).toThrow(/шапка дат/);
    });
});
