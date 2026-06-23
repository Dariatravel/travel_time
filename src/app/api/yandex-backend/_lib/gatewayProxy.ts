import { NextRequest, NextResponse } from 'next/server';

import { withRetry } from '@/app/api/yandex-backend/_lib/retry';

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

    const upstreamResponse = await withRetry(async () => {
        const response = await fetch(upstreamUrl, {
            method,
            headers,
            body: hasBody ? body : undefined,
            cache: 'no-store',
        });

        if (response.status >= 500) {
            throw new Error(`Supabase upstream failed with status ${response.status}`);
        }

        return response;
    });

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
