import { describe, expect, it } from 'vitest';

import { mergeTargets } from './reconcileTargets';

describe('кого сверять за заход', () => {
    it('сначала ждущие, потом круг, в пределах лимита', () => {
        const targets = mergeTargets(
            [
                { oko_contact_id: 1, waiting_since: '2026-09-13T10:00:00Z', unchecked: true },
                { oko_contact_id: 2, waiting_since: '2026-09-13T08:00:00Z', unchecked: false },
            ],
            [
                { oko_contact_id: 3, client_name: 'Анна' },
                { oko_contact_id: 4, client_name: 'Борис' },
            ],
            3,
        );
        expect(targets).toEqual([
            { oko_contact_id: 1, client_name: null, причина: 'ждёт ответа' },
            { oko_contact_id: 2, client_name: null, причина: 'перепроверка ждущего' },
            { oko_contact_id: 3, client_name: 'Анна', причина: 'круг' },
        ]);
    });

    it('контакт из круга, который уже взят как ждущий, не повторяется', () => {
        const targets = mergeTargets(
            [{ oko_contact_id: 1, waiting_since: null, unchecked: true }],
            [
                { oko_contact_id: 1, client_name: 'Анна' },
                { oko_contact_id: 5, client_name: null },
            ],
            5,
        );
        expect(targets.map((t) => t.oko_contact_id)).toEqual([1, 5]);
    });

    it('пустые номера пропускаются, пустые списки не ломают', () => {
        expect(mergeTargets([{ oko_contact_id: 0, waiting_since: null, unchecked: true }], [], 2)).toEqual([]);
        expect(mergeTargets([], [], 2)).toEqual([]);
    });
});
