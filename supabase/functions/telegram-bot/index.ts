/// <reference lib="deno.ns" />

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { buildAvailabilityAnswer } from './answerAvailability.ts';
import { parseManagerQuery } from './parseManagerQuery.ts';
import { sendMessage } from './telegramApi.ts';

const HELP_TEXT = [
    'Напишите даты и город — покажу свободные номера по актуальным шахматкам.',
    '',
    'Примеры:',
    '• Гагра 12-16 августа',
    '• Пицунда, Лдзаа 12.08-16.08',
    '• с 20 по 25 августа Сухум, Новый Афон 4 человека',
    '',
    'Города: Гагра, Цандрипш, Пицунда, Лдзаа, Алахадзы, Гудаута, Новый Афон, Сухум.',
    'Можно несколько через запятую, «везде» — искать по всей Абхазии.',
    '',
    'Показываю только 🟢 зелёные (ведёт человек) и 🔵 голубые (автосинхронизация) —',
    'по остальным занятость неизвестна.',
].join('\n');

const CITY_REQUIRED_TEXT = [
    'Даты понял, а город — нет. Допишите город, пожалуйста.',
    '',
    'Города: Гагра, Цандрипш, Пицунда, Лдзаа, Алахадзы, Гудаута, Новый Афон, Сухум.',
    'Можно несколько через запятую: «Гагра, Пицунда 12-16 августа».',
    'Если нужен весь берег — напишите «везде».',
].join('\n');

type TelegramChat = { id: number; title?: string; type?: string };
type TelegramMessage = {
    message_id: number;
    date: number;
    edit_date?: number;
    text?: string;
    caption?: string;
    chat: TelegramChat;
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    author_signature?: string;
};
type TelegramUpdate = {
    update_id: number;
    message?: TelegramMessage;
    edited_message?: TelegramMessage;
    channel_post?: TelegramMessage;
    edited_channel_post?: TelegramMessage;
};

const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const safeErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

const getSupabase = (): SupabaseClient => {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !serviceRoleKey) throw new Error('Сервисный доступ Supabase не настроен');

    return createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
};

const getManagerChatIds = () =>
    new Set(
        (Deno.env.get('TELEGRAM_MANAGER_CHAT_IDS') ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
    );

const storeChatMessage = async (
    supabase: SupabaseClient,
    update: TelegramUpdate,
    message: TelegramMessage,
) => {
    const text = message.text ?? message.caption;
    if (!text) return;

    const author = message.from;
    const authorName = author
        ? [author.first_name, author.last_name].filter(Boolean).join(' ') || null
        : (message.author_signature ?? null);
    const isEdit = Boolean(update.edited_message ?? update.edited_channel_post);
    const { error } = await supabase.from('telegram_chat_messages').upsert(
        {
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
            edited_at:
                isEdit && message.edit_date
                    ? new Date(message.edit_date * 1000).toISOString()
                    : null,
            raw: message,
        },
        { onConflict: 'chat_id,message_id' },
    );

    if (error) console.error('telegram_chat_messages upsert failed', error.message);
};

const answerManager = async (supabase: SupabaseClient, message: TelegramMessage, text: string) => {
    const command = /^\/(start|help|chatid)/.exec(text.trim().toLowerCase())?.[1];

    if (command === 'chatid') {
        await sendMessage(message.chat.id, `id этого чата: ${message.chat.id}`, message.message_id);
        return;
    }

    if (command === 'start' || command === 'help') {
        await sendMessage(message.chat.id, HELP_TEXT, message.message_id);
        return;
    }

    const query = parseManagerQuery(text);
    if (!query) return;

    if (!query.cities.length) {
        await sendMessage(message.chat.id, CITY_REQUIRED_TEXT, message.message_id);
        return;
    }

    try {
        const answer = await buildAvailabilityAnswer(supabase, query);
        await sendMessage(message.chat.id, answer, message.message_id);
    } catch (error) {
        console.error('availability answer failed', safeErrorMessage(error));
        await sendMessage(
            message.chat.id,
            'Не получилось посмотреть занятость. Попробуйте ещё раз через минуту.',
            message.message_id,
        );
    }
};

Deno.serve(async (request) => {
    if (request.method !== 'POST') return json({ ok: false }, 405);

    const expected = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
    const actual = request.headers.get('x-telegram-bot-api-secret-token');
    if (!expected || !actual || actual !== expected) return json({ ok: false }, 401);

    try {
        const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
        if (!update) return json({ ok: true });

        const message =
            update.message ??
            update.edited_message ??
            update.channel_post ??
            update.edited_channel_post;
        if (!message?.chat) return json({ ok: true });

        const text = message.text ?? message.caption ?? '';
        const supabase = getSupabase();

        // Правка сообщения — не новый запрос: иначе исправленная опечатка
        // приносит в чат второй такой же ответ.
        const isEdit = Boolean(update.edited_message ?? update.edited_channel_post);

        if (getManagerChatIds().has(String(message.chat.id))) {
            if (text && !isEdit) await answerManager(supabase, message, text);
        } else if (!isEdit && /^\/chatid/.test(text.trim().toLowerCase())) {
            await sendMessage(
                message.chat.id,
                `id этого чата: ${message.chat.id}`,
                message.message_id,
            );
        } else {
            await storeChatMessage(supabase, update, message);
        }
    } catch (error) {
        console.error('telegram webhook failed', safeErrorMessage(error));
    }

    return json({ ok: true });
});
