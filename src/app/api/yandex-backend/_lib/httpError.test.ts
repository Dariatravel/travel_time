import { describe, expect, it } from 'vitest';

import { HttpError, extractErrorInfo, toErrorResponse } from './httpError';

describe('extractErrorInfo', () => {
    it('обычный Error — берём message', () => {
        expect(extractErrorInfo(new Error('boom'))).toEqual({ message: 'boom' });
    });

    it('PostgrestError-подобный объект (не Error) — message и code не теряются', () => {
        // Ровно сценарий инцидента 15.07.2026: колонки is_fixed нет в базе
        const supabaseError = {
            code: 'PGRST204',
            message: "Could not find the 'is_fixed' column of 'reserves' in the schema cache",
            details: null,
            hint: null,
        };
        expect(extractErrorInfo(supabaseError)).toEqual({
            code: 'PGRST204',
            message: "Could not find the 'is_fixed' column of 'reserves' in the schema cache",
        });
    });

    it('строка — используется как message', () => {
        expect(extractErrorInfo('что-то упало')).toEqual({ message: 'что-то упало' });
    });

    it('null/undefined/пустое — пустой результат', () => {
        expect(extractErrorInfo(null)).toEqual({});
        expect(extractErrorInfo(undefined)).toEqual({});
        expect(extractErrorInfo('   ')).toEqual({});
        expect(extractErrorInfo({ message: '' })).toEqual({ message: undefined, code: undefined });
    });
});

describe('toErrorResponse', () => {
    it('HttpError — статус и сообщение как есть', async () => {
        const res = toErrorResponse(new HttpError(403, 'Forbidden'), 'fallback');
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'Forbidden' });
    });

    it('ошибка Supabase (объект) — 500 с реальным сообщением и кодом, а не fallback', async () => {
        const supabaseError = {
            code: 'PGRST204',
            message: "Could not find the 'is_fixed' column of 'reserves' in the schema cache",
        };
        const res = toErrorResponse(supabaseError, 'Failed to create reserve');
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({
            error: "Could not find the 'is_fixed' column of 'reserves' in the schema cache (код PGRST204)",
        });
    });

    it('конфликт по коду 23P01 — 409 с чистым сообщением (без кода в скобках)', async () => {
        const res = toErrorResponse(
            { code: '23P01', message: 'Наложение броней запрещено. Конфликт: Иванов' },
            'fallback',
        );
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({
            error: 'Наложение броней запрещено. Конфликт: Иванов',
        });
    });

    it('конфликт по тексту сообщения — 409', async () => {
        const res = toErrorResponse(new Error('На выбранные даты уже есть закрытие номера'), 'fb');
        expect(res.status).toBe(409);
    });

    it('совсем неизвестная ошибка — 500 с fallback-сообщением', async () => {
        const res = toErrorResponse(42, 'Failed to update reserve');
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Failed to update reserve' });
    });
});
