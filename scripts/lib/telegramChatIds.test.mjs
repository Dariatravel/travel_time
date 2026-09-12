import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    classifyTelegramChatId,
    managerChatIdIssue,
    parseTelegramChatIds,
} from './telegramChatIds.mjs';

describe('разбор TELEGRAM_MANAGER_CHAT_IDS', () => {
    it('различает супергруппу, обычную группу и личный чат', () => {
        assert.equal(classifyTelegramChatId('-100123').kind, 'supergroup');
        assert.equal(classifyTelegramChatId('-123').kind, 'group');
        assert.equal(classifyTelegramChatId('123').kind, 'private');
    });

    it('не считает @логин числовым id менеджерского чата', () => {
        const entry = classifyTelegramChatId('@manager_channel');
        assert.equal(entry.kind, 'username');
        assert.equal(entry.isNumeric, false);
        assert.match(managerChatIdIssue(entry), /в секрете не номер чата/);
    });

    it('отклоняет ссылку, текст и повреждённый номер', () => {
        for (const value of ['https://t.me/chat', 'менеджеры', '-100 123']) {
            const entry = classifyTelegramChatId(value);
            assert.equal(entry.kind, 'junk');
            assert.equal(entry.isNumeric, false);
        }
    });

    it('не пропускает пустую запись между запятыми', () => {
        const entries = parseTelegramChatIds('-100123, ,456');
        assert.equal(entries.length, 3);
        assert.equal(entries[1].kind, 'junk');
        assert.match(managerChatIdIssue(entries[1]), /в секрете не номер чата/);
    });

    it('сохраняет порядковые номера без раскрытия значений в объяснениях', () => {
        const [entry] = parseTelegramChatIds('https://t.me/private');
        const message = managerChatIdIssue(entry);
        assert.match(message, /Запись 1/);
        assert.doesNotMatch(message, /t\.me|private/);
    });
});
