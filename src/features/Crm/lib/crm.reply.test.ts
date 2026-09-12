import { describe, expect, it } from 'vitest';

import { replyTargetOf, type DealMessageRow } from './crm';

const msg = (id: number, extra: Partial<DealMessageRow> = {}): DealMessageRow => ({
    id,
    oko_message_id: id,
    deal_id: null,
    direction: 'in',
    author_type: 'contact',
    author_name: 'Гость',
    integration_id: 30,
    text: 'привет',
    files: [],
    sent_at: `2026-09-${String(10 + id).padStart(2, '0')}T10:00:00Z`,
    ...extra,
});

describe('куда отвечать через ОКО', () => {
    it('берёт идентификатор из самого свежего сообщения, где он есть', () => {
        const target = replyTargetOf([
            msg(1, { oko_contact_messenger_id: 111, oko_client_id: 9 }),
            msg(2, { oko_contact_messenger_id: 222, oko_client_id: null }),
            msg(3), // старое импортированное — без связи
        ]);
        expect(target).toEqual({ okoClientId: null, contactMessengerId: 222 });
    });

    it('без связи с ОКО отвечать нельзя', () => {
        expect(replyTargetOf([msg(1), msg(2)])).toBeNull();
        expect(replyTargetOf([])).toBeNull();
    });

    it('нули и пустые значения не считаются связью', () => {
        expect(replyTargetOf([msg(1, { oko_contact_messenger_id: 0 })])).toBeNull();
        expect(replyTargetOf([msg(1, { oko_contact_messenger_id: null })])).toBeNull();
    });
});
