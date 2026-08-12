// Что собралось из чатов Telegram: сколько сообщений, из каких чатов, последние
// по времени. Нужен, чтобы видеть, идёт ли сбор из чата отельеров — сам бот
// пишет туда молча, и без такого отчёта это никак не проверить.
//
// Запускается воркфлоу telegram-messages-report.yml (workflow_dispatch).

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const limit = Number(process.env.LAST_LIMIT ?? 20);
const supabase = createClient(url, key, { auth: { persistSession: false } });

const formatMoscow = (iso) =>
    iso
        ? new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', hour12: false })
        : '—';

const main = async () => {
    const { count, error: countError } = await supabase
        .from('telegram_chat_messages')
        .select('*', { count: 'exact', head: true });

    if (countError) throw new Error(`count: ${countError.message}`);

    console.log(`Всего сообщений в базе: ${count ?? 0}`);

    if (!count) {
        console.log('');
        console.log('Пока не собрано ни одного сообщения. Вероятные причины:');
        console.log('  1) бот не добавлен в чат отельеров;');
        console.log('  2) включён режим приватности — тогда бот видит только сообщения,');
        console.log('     начинающиеся со «/», и не видит обычную переписку;');
        console.log('  3) после подключения в чате ещё никто не писал.');

        return;
    }

    // Разрез по чатам: сразу видно, из каких чатов реально идёт поток.
    const { data: rows, error } = await supabase
        .from('telegram_chat_messages')
        .select('chat_id, chat_title, sent_at')
        .order('sent_at', { ascending: false })
        .limit(2000);

    if (error) throw new Error(`by chat: ${error.message}`);

    const byChat = new Map();
    for (const row of rows ?? []) {
        const stats = byChat.get(row.chat_id) ?? {
            title: row.chat_title ?? '(без названия)',
            count: 0,
            last: null,
        };
        stats.count += 1;
        if (!stats.last || (row.sent_at && row.sent_at > stats.last)) stats.last = row.sent_at;
        byChat.set(row.chat_id, stats);
    }

    console.log('');
    console.log('По чатам:');
    for (const [chatId, stats] of byChat) {
        console.log(`  ${chatId} — ${stats.title}: ${stats.count}, последнее ${formatMoscow(stats.last)}`);
    }

    const { data: last, error: lastError } = await supabase
        .from('telegram_chat_messages')
        .select('chat_title, author_name, text, sent_at, edited_at')
        .order('sent_at', { ascending: false })
        .limit(limit);

    if (lastError) throw new Error(`last: ${lastError.message}`);

    console.log('');
    console.log(`Последние ${last?.length ?? 0} сообщений (время московское):`);
    for (const row of last ?? []) {
        const text = (row.text ?? '').replace(/\s+/g, ' ').slice(0, 300);
        const edited = row.edited_at ? ' (правка)' : '';
        console.log('');
        console.log(`— ${formatMoscow(row.sent_at)}${edited} · ${row.author_name ?? '—'} · ${row.chat_title ?? '—'}`);
        console.log(`  ${text}`);
    }
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
