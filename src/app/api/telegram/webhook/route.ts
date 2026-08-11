/**
 * Вебхук Telegram-бота.
 *
 * Две задачи в одном обработчике:
 *   1. Чат МЕНЕДЖЕРОВ (список id в TELEGRAM_MANAGER_CHAT_IDS) — менеджер пишет
 *      даты, бот отвечает свободными номерами по зелёным и голубым шахматкам.
 *   2. Остальные чаты (чат отельеров) — сообщения складываются в базу, чтобы
 *      «окошки», о которых пишут словами, попадали в подборки без скриншотов.
 *
 * Отвечаем всегда 200: на любой другой код Telegram повторяет доставку, и одна
 * наша ошибка превратилась бы в бесконечные повторы одного и того же сообщения.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';

import { buildAvailabilityAnswer } from '../_lib/answerAvailability';
import { parseManagerQuery } from '../_lib/parseManagerQuery';
import { sendMessage } from '../_lib/telegramApi';

export const dynamic = 'force-dynamic';

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

const isAuthorized = (request: NextRequest) => {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    const actual = request.headers.get('x-telegram-bot-api-secret-token');

    return Boolean(expected && actual && actual === expected);
};

const getManagerChatIds = () =>
    new Set(
        (process.env.TELEGRAM_MANAGER_CHAT_IDS ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
    );

const storeChatMessage = async (update: TelegramUpdate, message: TelegramMessage) => {
    const text = message.text ?? message.caption;
    if (!text) return;

    const author = message.from;
    const authorName = author
        ? [author.first_name, author.last_name].filter(Boolean).join(' ') || null
        : (message.author_signature ?? null);
    const isEdit = Boolean(update.edited_message ?? update.edited_channel_post);

    const supabase = createSupabaseServiceRoleClient();
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
            edited_at: isEdit && message.edit_date ? new Date(message.edit_date * 1000).toISOString() : null,
            raw: message,
        },
        { onConflict: 'chat_id,message_id' },
    );

    if (error) {
        console.error('telegram_chat_messages upsert failed', error.message);
    }
};

const answerManager = async (message: TelegramMessage, text: string) => {
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
    // Без дат это обычная переписка менеджеров — молчим, чтобы не мешать.
    if (!query) return;

    // Даты есть, города нет: подсказываем, а не вываливаем всю Абхазию.
    if (!query.cities.length) {
        await sendMessage(message.chat.id, CITY_REQUIRED_TEXT, message.message_id);

        return;
    }

    try {
        const supabase = createSupabaseServiceRoleClient();
        const answer = await buildAvailabilityAnswer(supabase, query);
        await sendMessage(message.chat.id, answer, message.message_id);
    } catch (error) {
        console.error('availability answer failed', error);
        await sendMessage(
            message.chat.id,
            'Не получилось посмотреть занятость. Попробуйте ещё раз через минуту.',
            message.message_id,
        );
    }
};

export async function POST(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
    if (!update) return NextResponse.json({ ok: true });

    const message =
        update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post;
    if (!message?.chat) return NextResponse.json({ ok: true });

    const text = message.text ?? message.caption ?? '';

    try {
        if (getManagerChatIds().has(String(message.chat.id))) {
            if (text) await answerManager(message, text);
        } else if (/^\/chatid/.test(text.trim().toLowerCase())) {
            // Чтобы узнать id нового чата и добавить его в список менеджерских.
            await sendMessage(message.chat.id, `id этого чата: ${message.chat.id}`, message.message_id);
        } else {
            await storeChatMessage(update, message);
        }
    } catch (error) {
        console.error('telegram webhook failed', error);
    }

    return NextResponse.json({ ok: true });
}
