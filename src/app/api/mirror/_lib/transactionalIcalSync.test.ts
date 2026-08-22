import { describe, expect, it } from 'vitest';

import { isTransactionalIcalSyncEnabled, toExternalOccupancyMarks } from './transactionalIcalSync';

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
