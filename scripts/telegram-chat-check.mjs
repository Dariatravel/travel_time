#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { managerChatIdIssue, parseTelegramChatIds } from './lib/telegramChatIds.mjs';

const API = 'https://api.telegram.org';

const callTelegram = async (token, method, params = {}) => {
    try {
        const response = await fetch(`${API}/bot${token}/${method}`, {
            method: Object.keys(params).length ? 'POST' : 'GET',
            headers: Object.keys(params).length
                ? { 'Content-Type': 'application/x-www-form-urlencoded' }
                : undefined,
            body: Object.keys(params).length ? new URLSearchParams(params) : undefined,
            signal: AbortSignal.timeout(30_000),
        });
        return await response.json();
    } catch {
        return { ok: false, description: 'связь с Telegram не удалась' };
    }
};

const describeChat = (chat) => {
    const title = chat?.title || chat?.username || chat?.first_name || '(без названия)';
    return `«${title}» — тип ${chat?.type || '?'}`;
};

export const runTelegramChatCheck = async ({
    env = process.env,
    call = callTelegram,
    write = console.log,
} = {}) => {
    const token = String(env.TELEGRAM_BOT_TOKEN ?? '').trim();
    const rawIds = String(env.TELEGRAM_MANAGER_CHAT_IDS ?? '');

    if (!token) {
        write('Не задан секрет TELEGRAM_BOT_TOKEN');
        return 1;
    }
    if (!rawIds.trim()) {
        write('Не задан секрет TELEGRAM_MANAGER_CHAT_IDS');
        return 1;
    }

    const me = (await call(token, 'getMe')).result ?? null;
    const botName = me?.username ? `@${me.username}` : '(имя не узнать)';
    write(`=== БОТ: ${me?.first_name || ''} ${botName} ===`);
    if (!me) {
        write('Telegram не признал токен — проверьте секрет TELEGRAM_BOT_TOKEN.');
        return 1;
    }

    const entries = parseTelegramChatIds(rawIds);
    write(`\n=== ЧАТЫ ИЗ TELEGRAM_MANAGER_CHAT_IDS (записей: ${entries.length}) ===`);

    let reachable = 0;
    const hints = [];

    for (const entry of entries) {
        write(`\nЗапись ${entry.position}: ${entry.description}`);

        const issue = managerChatIdIssue(entry);
        if (issue) {
            write('  ✗ спрашивать Telegram не о чем');
            hints.push(issue);
            continue;
        }

        const answer = await call(token, 'getChat', { chat_id: entry.value });
        if (answer.ok) {
            write(`  ✓ ${describeChat(answer.result)}, бот в чате состоит`);
            reachable += 1;
            continue;
        }

        write(`  ✗ Telegram отказал: ${answer.description || 'без объяснения'}`);

        if (entry.kind === 'group') {
            const candidate = `-100${entry.value.slice(1)}`;
            const grown = await call(token, 'getChat', { chat_id: candidate });
            if (grown.ok) {
                write(`  → та же группа нашлась как супергруппа: ${describeChat(grown.result)}`);
                hints.push(
                    `Запись ${entry.position}: группу повысили до супергруппы, поэтому старый id ` +
                        'больше не работает. Новый номер бот назовёт командой /chatid в этом чате.',
                );
                continue;
            }
            hints.push(
                `Запись ${entry.position}: id обычной группы не работает, и соответствующая ` +
                    `супергруппа не найдена. Скорее всего ${botName} удалили из чата либо номер неверный.`,
            );
        } else if (entry.kind === 'private') {
            hints.push(
                `Запись ${entry.position}: это личный чат. Бот не может написать первым — ` +
                    `человек должен один раз нажать «Start» у ${botName}.`,
            );
        } else {
            hints.push(
                `Запись ${entry.position}: номер похож на настоящий, значит ${botName} в этом чате ` +
                    'не состоит — его надо добавить участником.',
            );
        }
    }

    write(`\nВсего записей: ${entries.length}, чатов доступно боту: ${reachable}`);

    if (hints.length) {
        write('\nЧто именно сломано:');
        for (const hint of hints) write(`  • ${hint}`);
    }

    if (reachable === 0) {
        write('\nНи один чат недоступен — оповещения не дойдут никуда.');
        write('Как починить:');
        write(`  1. Убедиться, что ${botName} состоит в чате менеджеров; если нет — добавить.`);
        write('  2. Написать в этом чате «/chatid» — бот ответит номером чата.');
        write('  3. Вставить номер в секрет TELEGRAM_MANAGER_CHAT_IDS.');
        write('  4. Запустить эту проверку снова.');
        return 1;
    }

    if (reachable < entries.length) {
        write('\nЧасть записей не работает. Оповещения дойдут только в доступные чаты.');
    }

    return 0;
};

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
    process.exitCode = await runTelegramChatCheck();
}
