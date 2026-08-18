import { NextRequest, NextResponse } from 'next/server';

import { withRetry } from '@/app/api/yandex-backend/_lib/retry';

// Замер 18.08, 22:56 МСК: обращение наружу перестало проходить совсем —
// 25,2 / 26,0 / 25,4 с на всех трёх попытках. Это ровно три захода по восемь
// секунд с паузами, то есть повторы упирались в тот же обрыв.
//
// Пять секунд и один повтор дают предел около десяти секунд вместо двадцати
// пяти. Когда связь наружу пропала совсем, повторять больше смысла нет:
// быстрый отказ честнее долгого ожидания — менеджер увидит ошибку и повторит
// сам, а не будет смотреть на пустой экран.
const UPSTREAM_TIMEOUT_MS = 5_000;
const UPSTREAM_RETRIES = 1;

const ALLOWED_PREFIXES = ['auth/v1/', 'rest/v1/', 'storage/v1/'] as const;

const FORWARD_REQUEST_HEADERS = [
    'accept',
    'accept-profile',
    'authorization',
    'apikey',
    'content-profile',
    'content-type',
    'prefer',
    'range',
    'x-client-info',
] as const;

const FORWARD_RESPONSE_HEADERS = [
    'content-type',
    'content-range',
    'x-supabase-api-version',
    'retry-after',
] as const;

const getUpstreamBaseUrl = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!url) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
    }

    return url.replace(/\/$/, '');
};

export const isAllowedGatewayPath = (path: string) =>
    ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));

export async function proxySupabaseGatewayRequest(
    request: NextRequest,
    pathSegments: string[],
) {
    const path = pathSegments.join('/');

    if (!isAllowedGatewayPath(path)) {
        return NextResponse.json({ error: 'Forbidden gateway path' }, { status: 403 });
    }

    const upstreamBaseUrl = getUpstreamBaseUrl();
    const upstreamUrl = new URL(`${upstreamBaseUrl}/${path}`);
    upstreamUrl.search = request.nextUrl.search;

    const headers = new Headers();

    FORWARD_REQUEST_HEADERS.forEach((headerName) => {
        const value = request.headers.get(headerName);
        if (value) {
            headers.set(headerName, value);
        }
    });

    if (!headers.has('apikey') && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        headers.set('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    }

    const method = request.method.toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const body = hasBody ? await request.arrayBuffer() : undefined;

    const fetchUpstream = async () => {
        // Без своего срока ожидания зависший запрос к Supabase не заканчивается
        // ничем: он просто держится, пока контейнер не оборвёт его на тридцатой
        // секунде. Браузер в этот момент показывает вечную загрузку без ошибки,
        // а повтор ниже не срабатывает — повторять нечего, ошибки-то не было.
        //
        // Замер 18.08: тот же запрос списка отелей — 0,3 с напрямую в базу, а
        // через программу 0,73 с, 0,82 с и 30,5 с. То есть изредка обращение
        // наружу подвисает, и тогда менеджер ждёт полминуты вместо секунды.
        //
        // Восемь секунд — заведомо больше обычного ответа и заведомо меньше
        // предела контейнера, так что на повтор время остаётся.
        const response = await fetch(upstreamUrl, {
            method,
            headers,
            body: hasBody ? body : undefined,
            cache: 'no-store',
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });

        if (response.status >= 500) {
            throw new Error(`Supabase upstream failed with status ${response.status}`);
        }

        return response;
    };

    const upstreamResponse =
        method === 'GET' || method === 'HEAD'
            ? await withRetry(fetchUpstream, { retries: UPSTREAM_RETRIES })
            : await fetchUpstream();

    const responseHeaders = new Headers();
    FORWARD_RESPONSE_HEADERS.forEach((headerName) => {
        const value = upstreamResponse.headers.get(headerName);
        if (value) {
            responseHeaders.set(headerName, value);
        }
    });

    return new NextResponse(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders,
    });
}
