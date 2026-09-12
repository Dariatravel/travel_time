import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runTelegramChatCheck } from './telegram-chat-check.mjs';

const BOT = { ok: true, result: { username: 'testbot', first_name: 'Проверка' } };
const DENIED = { ok: false, description: 'Bad Request: chat not found' };

const run = async (managerChatIds, answers = {}) => {
    const lines = [];
    const call = async (_token, method, params = {}) => {
        if (method === 'getMe') return BOT;
        return answers[params.chat_id] ?? DENIED;
    };
    const code = await runTelegramChatCheck({
        env: {
            TELEGRAM_BOT_TOKEN: 'test-token',
            TELEGRAM_MANAGER_CHAT_IDS: managerChatIds,
        },
        call,
        write: (line) => lines.push(line),
    });
    return { code, output: lines.join('\n') };
};

describe('проверка доступности чатов Telegram', () => {
    it('понятно сообщает об отсутствующем токене', async () => {
        const lines = [];
        const code = await runTelegramChatCheck({
            env: { TELEGRAM_MANAGER_CHAT_IDS: '-1001111' },
            write: (line) => lines.push(line),
        });
        assert.equal(code, 1);
        assert.match(lines.join('\n'), /Не задан секрет TELEGRAM_BOT_TOKEN/);
    });

    it('понятно сообщает о пустом списке чатов', async () => {
        const lines = [];
        const code = await runTelegramChatCheck({
            env: { TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_MANAGER_CHAT_IDS: '   ' },
            write: (line) => lines.push(line),
        });
        assert.equal(code, 1);
        assert.match(lines.join('\n'), /Не задан секрет TELEGRAM_MANAGER_CHAT_IDS/);
    });

    it('завершается успешно для рабочего чата и не печатает его id', async () => {
        const id = '-1001111';
        const result = await run(id, {
            [id]: { ok: true, result: { title: 'Менеджеры', type: 'supergroup' } },
        });
        assert.equal(result.code, 0);
        assert.match(result.output, /«Менеджеры»/);
        assert.doesNotMatch(result.output, new RegExp(id));
    });

    it('распознаёт группу, повышенную до супергруппы, без раскрытия обоих id', async () => {
        const oldId = '-1111';
        const newId = '-1001111';
        const result = await run(oldId, {
            [newId]: { ok: true, result: { title: 'Менеджеры', type: 'supergroup' } },
        });
        assert.equal(result.code, 1);
        assert.match(result.output, /повысили до супергруппы/);
        assert.doesNotMatch(result.output, new RegExp(oldId));
        assert.doesNotMatch(result.output, new RegExp(newId));
    });

    it('останавливается до обращения к чату, если в секрете ссылка', async () => {
        const result = await run('https://t.me/chat');
        assert.equal(result.code, 1);
        assert.match(result.output, /в секрете не номер чата/);
        assert.doesNotMatch(result.output, /https|t\.me/);
    });

    it('называет бота, которого надо добавить в недоступный чат', async () => {
        const result = await run('-1002222');
        assert.equal(result.code, 1);
        assert.match(result.output, /@testbot/);
        assert.doesNotMatch(result.output, /-1002222/);
    });

    it('объясняет, что для личного чата надо нажать Start', async () => {
        const result = await run('555');
        assert.match(result.output, /Start/);
        assert.doesNotMatch(result.output, /555/);
    });

    it('сохраняет доставку в рабочий чат, если другая запись испорчена', async () => {
        const id = '-1001111';
        const result = await run(`${id},https://t.me/chat`, {
            [id]: { ok: true, result: { title: 'Менеджеры', type: 'supergroup' } },
        });
        assert.equal(result.code, 0);
        assert.match(result.output, /дойдут только в доступные чаты/);
        assert.doesNotMatch(result.output, new RegExp(id));
        assert.doesNotMatch(result.output, /https|t\.me/);
    });
});
