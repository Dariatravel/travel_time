import { describe, expect, it } from 'vitest';

import {
    chunk,
    clientSearchTerm,
    dealAgeDays,
    dealTitle,
    formatDate,
    formatMoney,
    groupByStage,
    importTableForFile,
    parseJsonl,
    SALES_STAGES,
    STAGE_LABELS,
    type DealRow,
} from './crm';

const deal = (id: string, extra: Partial<DealRow> = {}): DealRow => ({
    id,
    oko_lead_id: null,
    client_id: null,
    oko_contact_id: null,
    reserve_id: null,
    title: null,
    pipeline: 'sales',
    stage: 'zayavka',
    source: null,
    responsible: null,
    hotel_full: null,
    hotel_title: null,
    check_in: null,
    check_out: null,
    people: null,
    price_per_night: null,
    nights: null,
    service_note: null,
    total: null,
    prepaid: null,
    to_pay: null,
    payment_bank: null,
    payment_date: null,
    comment: null,
    refund_amount: null,
    penalty: null,
    tags: [],
    oko_created_at: null,
    oko_updated_at: null,
    arrived_stage_at: null,
    oko_url: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    updated_by: null,
    ...extra,
});

describe('этапы как в OKO', () => {
    it('семь этапов воронки продаж в том же порядке и с теми же названиями', () => {
        expect(SALES_STAGES.map((s) => s.label)).toEqual([
            'Заявка',
            'Подбор',
            'Думают',
            'Уточнить детали',
            'Ждем оплату',
            'Бронь',
            'Отказ',
        ]);
        expect(STAGE_LABELS.vozvrat).toBe('Возврат');
    });

    it('раскладывает по колонкам с суммой и сортирует новые вверх', () => {
        const columns = groupByStage(
            [
                deal('a', { stage: 'bron', total: 10000, arrived_stage_at: '2026-09-01T00:00:00Z' }),
                deal('b', { stage: 'bron', total: '2500' as unknown as number, arrived_stage_at: '2026-09-05T00:00:00Z' }),
                deal('c', { stage: 'otkaz' }),
                deal('d', { stage: 'vozvrat', pipeline: 'refund', total: 999 }),
            ],
            'sales',
        );
        const bron = columns.find((c) => c.stage.key === 'bron');
        expect(bron?.deals.map((d) => d.id)).toEqual(['b', 'a']);
        expect(bron?.sum).toBe(12500);
        expect(columns.find((c) => c.stage.key === 'otkaz')?.deals.length).toBe(1);
        expect(columns.reduce((n, c) => n + c.deals.length, 0)).toBe(3);
    });
});

describe('карточка', () => {
    it('название: заголовок → имя клиента → номер', () => {
        expect(dealTitle(deal('1', { title: 'Отдых Гурген' }))).toBe('Отдых Гурген');
        expect(dealTitle(deal('1', { clients: { id: 'c', name: 'Анна', phones: [], emails: [] } as never }))).toBe('Анна');
        expect(dealTitle(deal('1', { oko_lead_id: 2799448 }))).toBe('Сделка #2799448');
    });

    it('возраст в днях от создания в OKO', () => {
        const now = Date.parse('2026-09-15T12:00:00Z');
        expect(dealAgeDays(deal('1', { oko_created_at: '2026-09-03T18:00:00Z' }), now)).toBe(11);
        expect(dealAgeDays(deal('1', { oko_created_at: null, created_at: '2026-09-15T00:00:00Z' }), now)).toBe(0);
    });

    it('форматы', () => {
        // Intl разделяет разряды неразрывным пробелом — сравниваем по обычным.
        expect(formatMoney(177458111).replace(/\s/g, ' ')).toBe('177 458 111 ₽');
        expect(formatMoney(null)).toBe('—');
        expect(formatDate('2026-09-19')).toBe('19.09.2026');
        expect(formatDate(null)).toBe('—');
    });
});

describe('импорт', () => {
    it('разбирает jsonl и считает битые строки', () => {
        const { rows, broken } = parseJsonl('{"a":1}\n\n{"a":2}\nне json\n[1,2]\n');
        expect(rows).toEqual([{ a: 1 }, { a: 2 }]);
        expect(broken).toBe(2);
    });

    it('таблица по имени файла', () => {
        expect(importTableForFile('clients.jsonl')).toBe('clients');
        expect(importTableForFile('Deals (1).jsonl')).toBe('deals');
        expect(importTableForFile('messages.jsonl')).toBe('deal_messages');
        expect(importTableForFile('сводка.txt')).toBeNull();
    });

    it('режет на пачки', () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
        expect(chunk([], 2)).toEqual([]);
    });
});

describe('поиск клиентов', () => {
    it('телефон — по цифрам, имя — по тексту', () => {
        expect(clientSearchTerm('8 (900) 123-45-67')).toEqual({ phoneDigits: '79001234567', name: null });
        expect(clientSearchTerm('+7 900')).toEqual({ phoneDigits: '7900', name: null });
        expect(clientSearchTerm('Иванова')).toEqual({ phoneDigits: null, name: 'Иванова' });
        expect(clientSearchTerm('  ')).toEqual({ phoneDigits: null, name: null });
    });
});
