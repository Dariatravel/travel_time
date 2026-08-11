/**
 * Отправка сообщений ботом. Telegram не принимает сообщения длиннее 4096
 * символов, поэтому длинный ответ режется по строкам на несколько сообщений.
 */

const TELEGRAM_MESSAGE_LIMIT = 4096;

const getToken = () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');

    return token;
};

/** Режем по абзацам и строкам, чтобы отель не разрывался пополам. */
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

export const sendMessage = async (chatId: number | string, text: string, replyTo?: number) => {
    const token = getToken();

    for (const chunk of splitMessage(text)) {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: chunk,
                disable_web_page_preview: true,
                ...(replyTo ? { reply_to_message_id: replyTo } : {}),
            }),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            console.error('Telegram sendMessage failed', response.status, body);

            return;
        }
    }
};
