// Сбор сообщений из чата отельеров через бота Telegram.
// Запускается воркфлоу telegram-collect.yml (крон раз в час + вручную).
//
// Бот читает очередь обновлений (getUpdates) и складывает сообщения в
// public.telegram_chat_messages. Telegram хранит очередь ~24 часа, поэтому
// часового крона достаточно. Правки сообщений (edited_message) перезаписывают
// текст той же строки — в чате отельеры часто правят даты.
//
// Важно: getUpdates не работает, если у бота выставлен webhook. Тогда Telegram
// отвечает 409 — скрипт скажет об этом прямым текстом.

import { createClient } from '@supabase/supabase-js';

const token = process.env.TELEGRAM_BOT_TOKEN;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const API = `https://api.telegram.org/bot${token}`;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const callTelegram = async (method, params) => {
    const response = await fetch(`${API}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params ?? {}),
    });
    const body = await response.json().catch(() => null);

    if (!response.ok || !body?.ok) {
        const description = body?.description ?? `HTTP ${response.status}`;
        if (response.status === 409) {
            throw new Error(
                `Telegram: ${description}. У бота выставлен webhook — getUpdates недоступен. ` +
                    'Снимите webhook (deleteWebhook) либо переводите сбор на webhook.',
            );
        }
        if (response.status === 401) {
            throw new Error(`Telegram: ${description}. Проверьте TELEGRAM_BOT_TOKEN.`);
        }
        throw new Error(`Telegram ${method}: ${description}`);
    }

    return body.result;
};

const readLastUpdateId = async () => {
    const { data, error } = await supabase
        .from('telegram_bot_state')
        .select('last_update_id')
        .eq('id', true)
        .maybeSingle();

    if (error) throw new Error(`telegram_bot_state: ${error.message}`);

    return Number(data?.last_update_id ?? 0);
};

const saveLastUpdateId = async (lastUpdateId) => {
    const { error } = await supabase
        .from('telegram_bot_state')
        .upsert({ id: true, last_update_id: lastUpdateId, updated_at: new Date().toISOString() });

    if (error) throw new Error(`telegram_bot_state upsert: ${error.message}`);
};

// Из обновления достаём само сообщение: обычное, отредактированное либо пост канала.
const extractMessage = (update) => {
    const message =
        update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post;
    if (!message) return null;

    const isEdit = Boolean(update.edited_message ?? update.edited_channel_post);
    const text = message.text ?? message.caption ?? null;
    if (!text) return null; // фото/стикеры без подписи нам нечего разбирать

    const author = message.from;
    const authorName = author
        ? [author.first_name, author.last_name].filter(Boolean).join(' ') || null
        : (message.author_signature ?? null);

    return {
        chat_id: message.chat.id,
        chat_title: message.chat.title ?? null,
        chat_type: message.chat.type ?? null,
        message_id: message.message_id,
        update_id: update.update_id,
        author_id: author?.id ?? null,
        author_name: authorName,
        author_username: author?.username ?? null,
        text,
        sent_at: new Date(message.date * 1000).toISOString(),
        edited_at: isEdit && message.edit_date ? new Date(message.edit_date * 1000).toISOString() : null,
        raw: message,
    };
};

const main = async () => {
    const me = await callTelegram('getMe');
    console.log(`Бот: @${me.username} (${me.first_name})`);

    let offset = (await readLastUpdateId()) + 1;
    const rows = [];
    let lastUpdateId = offset - 1;
    let fetched = 0;

    // Забираем очередь порциями, пока Telegram не вернёт пустой список.
    for (;;) {
        const updates = await callTelegram('getUpdates', {
            offset,
            limit: 100,
            timeout: 0,
            allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
        });

        if (!updates.length) break;

        fetched += updates.length;

        for (const update of updates) {
            lastUpdateId = Math.max(lastUpdateId, update.update_id);
            const row = extractMessage(update);
            if (row) rows.push(row);
        }

        offset = lastUpdateId + 1;
        if (updates.length < 100) break;
    }

    if (rows.length) {
        // Правка сообщения приходит с тем же message_id — перезаписываем строку.
        const { error } = await supabase
            .from('telegram_chat_messages')
            .upsert(rows, { onConflict: 'chat_id,message_id' });

        if (error) throw new Error(`telegram_chat_messages upsert: ${error.message}`);
    }

    // Сдвигаем очередь только после успешной записи: если upsert упал, скрипт
    // бросил исключение выше и сообщения придут снова на следующем запуске.
    if (fetched > 0) {
        await saveLastUpdateId(lastUpdateId);
    }

    const chats = new Map();
    for (const row of rows) {
        chats.set(row.chat_id, row.chat_title ?? row.chat_type);
    }

    console.log(`Обновлений получено: ${fetched}, сообщений с текстом: ${rows.length}`);
    for (const [chatId, title] of chats) {
        console.log(`  чат ${chatId}: ${title}`);
    }
    if (!fetched) {
        console.log('Новых сообщений нет.');
    }
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
