/// <reference lib="deno.ns" />

const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_TIMEOUT_MS = 10_000;

const getToken = () => {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN не настроен');

    return token;
};

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

const sendChunk = async (chatId: number | string, text: string, replyTo?: number) => {
    let response: Response;

    try {
        response = await fetch(`https://api.telegram.org/bot${getToken()}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                disable_web_page_preview: true,
                ...(replyTo ? { reply_to_message_id: replyTo } : {}),
            }),
            signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
        });
    } catch {
        throw new Error('Telegram Bot API недоступен');
    }

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Telegram sendMessage: ${response.status} ${body}`.trim());
    }
};

export const sendMessage = async (chatId: number | string, text: string, replyTo?: number) => {
    for (const chunk of splitMessage(text)) {
        await sendChunk(chatId, chunk, replyTo);
    }
};
