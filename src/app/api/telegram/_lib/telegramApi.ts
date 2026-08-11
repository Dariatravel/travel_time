/**
 * Отправка сообщений ботом.
 *
 * Контейнер в Yandex Cloud не может соединиться с api.telegram.org: в логах
 * ConnectTimeoutError на 10 секундах, при том что входящие вебхуки доходят
 * нормально. Поэтому отправка идёт в два захода: сначала напрямую с коротким
 * ожиданием, а если не вышло — через GitHub Actions (оттуда связь с Telegram
 * есть, тем же путём уже работают кнопки «Обновить занятость»). Обход медленнее
 * на полминуты, зато ответ доходит; когда сеть Яндекса починят, прямой путь
 * начнёт срабатывать сам и обход перестанет использоваться.
 *
 * Telegram не принимает сообщения длиннее 4096 символов, поэтому длинный ответ
 * режется по строкам на несколько сообщений.
 */

const TELEGRAM_MESSAGE_LIMIT = 4096;

/** Прямой путь заведомо сломан — ждём недолго и уходим в обход. */
const DIRECT_TIMEOUT_MS = 6000;

const OWNER = 'Dariatravel';
const REPO = 'travel_time';
const SEND_WORKFLOW = 'telegram-send.yml';

const getToken = () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');

    return token;
};

/** Режем по строкам, чтобы отель не разрывался пополам. */
export const splitMessage = (text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] => {
    if (text.length <= limit) return [text];

    const chunks: string[] = [];
    let current = '';

    for (const block of text.split('\n')) {
        const candidate = current ? `${current}\n${block}` : block;

        if (candidate.length <= limit) {
            current = candidate;
            continue;
        }

        if (current) chunks.push(current);

        // Одна строка длиннее лимита — режем её жёстко.
        let rest = block;
        while (rest.length > limit) {
            chunks.push(rest.slice(0, limit));
            rest = rest.slice(limit);
        }
        current = rest;
    }

    if (current) chunks.push(current);

    return chunks;
};

const sendDirect = async (chatId: number | string, text: string, replyTo?: number) => {
    const response = await fetch(`https://api.telegram.org/bot${getToken()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: true,
            ...(replyTo ? { reply_to_message_id: replyTo } : {}),
        }),
        signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');

        throw new Error(`Telegram sendMessage: ${response.status} ${body}`.trim());
    }
};

const sendViaGithub = async (chatId: number | string, text: string, replyTo?: number) => {
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!token) throw new Error('Обходная отправка не настроена (нет GITHUB_DISPATCH_TOKEN)');

    const response = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${SEND_WORKFLOW}/dispatches`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ref: 'main',
                inputs: {
                    chat_id: String(chatId),
                    text,
                    reply_to: replyTo ? String(replyTo) : '',
                },
            }),
        },
    );

    // Успех = 204 No Content.
    if (!response.ok) {
        const body = await response.text().catch(() => '');

        throw new Error(`GitHub dispatch: ${response.status} ${body}`.trim());
    }
};

export const sendMessage = async (chatId: number | string, text: string, replyTo?: number) => {
    for (const chunk of splitMessage(text)) {
        try {
            await sendDirect(chatId, chunk, replyTo);
        } catch (directError) {
            console.warn(
                'Прямая отправка в Telegram не удалась, уходим в обход:',
                directError instanceof Error ? directError.message : directError,
            );

            try {
                await sendViaGithub(chatId, chunk, replyTo);
            } catch (fallbackError) {
                console.error(
                    'Обходная отправка тоже не удалась:',
                    fallbackError instanceof Error ? fallbackError.message : fallbackError,
                );

                return;
            }
        }
    }
};
