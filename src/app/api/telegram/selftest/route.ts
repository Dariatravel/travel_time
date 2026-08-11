/**
 * Проверка исходящей связи контейнера с Telegram.
 *
 * Входящие вебхуки до нас доходят, а вот ответ бота уходит через
 * api.telegram.org — и в логах видно ConnectTimeoutError на 10 секундах.
 * Этот маршрут отвечает на вопрос «совсем не пускает или просто медленно»:
 * пробует Telegram с большим запасом по времени и, для сравнения, обычный
 * внешний адрес, к которому приложение и так ходит за занятостью.
 *
 * Доступ по тому же секрету, что и у вебхука, — чтобы адрес не дёргали чужие.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 25000;

type ProbeResult = {
    target: string;
    ok: boolean;
    status?: number;
    ms: number;
    error?: string;
};

const probe = async (label: string, url: string): Promise<ProbeResult> => {
    const startedAt = Date.now();

    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: 'no-store',
        });

        return { target: label, ok: response.ok, status: response.status, ms: Date.now() - startedAt };
    } catch (error) {
        const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';

        return {
            target: label,
            ok: false,
            ms: Date.now() - startedAt,
            error: [error instanceof Error ? error.message : String(error), cause]
                .filter(Boolean)
                .join(' / '),
        };
    }
};

export async function GET(request: NextRequest) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    const actual =
        request.nextUrl.searchParams.get('token') ??
        request.headers.get('x-telegram-bot-api-secret-token');

    if (!expected || actual !== expected) {
        return NextResponse.json({ ok: false }, { status: 401 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;

    const results = await Promise.all([
        token
            ? probe('api.telegram.org/getMe', `https://api.telegram.org/bot${token}/getMe`)
            : Promise.resolve<ProbeResult>({
                  target: 'api.telegram.org/getMe',
                  ok: false,
                  ms: 0,
                  error: 'TELEGRAM_BOT_TOKEN не задан в контейнере',
              }),
        // Для сравнения: внешний адрес, к которому приложение ходит за занятостью.
        probe('reservationsteps.ru', 'https://reservationsteps.ru/'),
    ]);

    return NextResponse.json({
        timeoutMs: TIMEOUT_MS,
        hasBotToken: Boolean(token),
        hasManagerChatIds: Boolean(process.env.TELEGRAM_MANAGER_CHAT_IDS),
        results,
    });
}
