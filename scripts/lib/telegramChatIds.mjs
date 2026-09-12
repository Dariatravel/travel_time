const SUPERGROUP_PATTERN = /^-100\d+$/;
const GROUP_PATTERN = /^-\d+$/;
const PRIVATE_PATTERN = /^\d+$/;
const USERNAME_PATTERN = /^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

/**
 * Определить вид записи из TELEGRAM_MANAGER_CHAT_IDS, не выводя само значение.
 * Для менеджерских оповещений принимаются только числовые id чатов.
 */
export const classifyTelegramChatId = (rawValue, position = 1) => {
    const value = String(rawValue ?? '').trim();

    if (SUPERGROUP_PATTERN.test(value)) {
        return {
            position,
            value,
            kind: 'supergroup',
            isNumeric: true,
            description: 'числовой id супергруппы или канала',
        };
    }

    if (GROUP_PATTERN.test(value)) {
        return {
            position,
            value,
            kind: 'group',
            isNumeric: true,
            description:
                'числовой id обычной группы; после повышения до супергруппы он перестаёт работать',
        };
    }

    if (PRIVATE_PATTERN.test(value)) {
        return {
            position,
            value,
            kind: 'private',
            isNumeric: true,
            description: 'числовой id личного чата; оповещения придут одному человеку',
        };
    }

    if (USERNAME_PATTERN.test(value)) {
        return {
            position,
            value,
            kind: 'username',
            isNumeric: false,
            description: '@логин вместо числового id чата',
        };
    }

    return {
        position,
        value,
        kind: 'junk',
        isNumeric: false,
        description: value
            ? 'не похоже на id: в секрете текст, ссылка или опечатка'
            : 'пустая запись между запятыми',
    };
};

export const parseTelegramChatIds = (rawValue) => {
    const source = String(rawValue ?? '');
    if (!source.trim()) return [];

    return source.split(',').map((value, index) => classifyTelegramChatId(value, index + 1));
};

export const managerChatIdIssue = (entry) => {
    if (entry.isNumeric) return null;

    if (entry.kind === 'username') {
        return `Запись ${entry.position}: в секрете не номер чата, а @логин; нужен числовой id`;
    }

    return `Запись ${entry.position}: в секрете не номер чата; там текст, ссылка, пустое значение или опечатка`;
};
