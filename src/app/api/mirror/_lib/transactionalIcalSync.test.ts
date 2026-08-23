import { describe, expect, it } from 'vitest';

import {
    getIcalSyncSafetyError,
    getTransactionalIcalMinRetainedRatio,
    isLargeIcalDecreaseConfirmed,
    isTransactionalIcalSyncEnabled,
    parseExternalOccupancySummary,
    toExternalOccupancyMarks,
} from './transactionalIcalSync';

describe('isTransactionalIcalSyncEnabled', () => {
    it.each([
        [undefined, true],
        ['', true],
        ['true', true],
        ['1', true],
        ['false', false],
        [' FALSE ', false],
    ])('для значения %s возвращает %s', (value, expected) => {
        expect(isTransactionalIcalSyncEnabled(value)).toBe(expected);
    });
});

describe('настройки безопасной синхронизации', () => {
    it.each([
        [undefined, 0.5],
        ['', 0.5],
        ['0', 0],
        ['0.75', 0.75],
        ['1', 1],
    ])('читает порог %s как %s', (value, expected) => {
        expect(getTransactionalIcalMinRetainedRatio(value)).toBe(expected);
    });

    it.each(['-0.1', '1.1', 'not-a-number'])('отклоняет некорректный порог %s', (value) => {
        expect(() => getTransactionalIcalMinRetainedRatio(value)).toThrow('числом от 0 до 1');
    });

    it('требует точное true для подтверждения крупного уменьшения', () => {
        expect(isLargeIcalDecreaseConfirmed(' true ')).toBe(true);
        expect(isLargeIcalDecreaseConfirmed('false')).toBe(false);
        expect(isLargeIcalDecreaseConfirmed(undefined)).toBe(false);
    });
});

describe('getIcalSyncSafetyError', () => {
    const base = {
        sourceComplete: true,
        confirmedEmpty: false,
        existingCount: 60,
        proposedCount: 60,
        minRetainedRatio: 0.5,
        confirmLargeDecrease: false,
    };

    it('отклоняет неполный ответ и неподтверждённую пустоту', () => {
        expect(getIcalSyncSafetyError({ ...base, sourceComplete: false })).toContain(
            'неполный ответ',
        );
        expect(getIcalSyncSafetyError({ ...base, proposedCount: 0 })).toContain(
            'не подтвердил пустой ответ',
        );
    });

    it('разрешает подтверждённую пустоту', () => {
        expect(
            getIcalSyncSafetyError({ ...base, proposedCount: 0, confirmedEmpty: true }),
        ).toBeNull();
    });

    it('останавливает резкое уменьшение до явного подтверждения', () => {
        expect(getIcalSyncSafetyError({ ...base, proposedCount: 20 })).toContain(
            'подозрительно уменьшилось',
        );
        expect(
            getIcalSyncSafetyError({
                ...base,
                proposedCount: 20,
                confirmLargeDecrease: true,
            }),
        ).toBeNull();
    });
});

describe('parseExternalOccupancySummary', () => {
    it('возвращает количества успешного запуска', () => {
        expect(
            parseExternalOccupancySummary({
                status: 'ok',
                inserted: 12,
                skipped_manual: 1,
            }),
        ).toEqual({ inserted: 12, skippedManual: 1 });
    });

    it('преобразует сохранённую ошибку RPC в ошибку приложения', () => {
        expect(() =>
            parseExternalOccupancySummary({
                status: 'error',
                error: 'Источник вернул неполный ответ',
                inserted: 0,
                skipped_manual: 0,
            }),
        ).toThrow('Источник вернул неполный ответ');
    });
});

describe('toExternalOccupancyMarks', () => {
    it('формирует payload процедуры без полей старого insert', () => {
        expect(
            toExternalOccupancyMarks(
                [{ roomId: 'room-1', start: 100, end: 200, icalId: 523508 }],
                { tag: 'ical_reservationsteps', guest: 'Занято' },
                'Категория продана целиком',
            ),
        ).toEqual([
            {
                room_id: 'room-1',
                start_at: 100,
                end_at: 200,
                guest: 'Занято',
                comment: 'Категория продана целиком',
                external_uid: 'ical_reservationsteps:room-1:100-200',
                external_feed_url: 'https://public-api.reservationsteps.ru/v1/api/ical/523508',
            },
        ]);
    });
});
