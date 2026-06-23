import { NextRequest } from 'next/server';

import { disabledResponse, isYandexBackendProxyEnabled } from '@/app/api/yandex-backend/_lib/featureFlag';
import { proxySupabaseGatewayRequest } from '@/app/api/yandex-backend/_lib/gatewayProxy';

export const dynamic = 'force-dynamic';

type RouteContext = {
    params: Promise<{ path: string[] }>;
};

const handleRequest = async (request: NextRequest, context: RouteContext) => {
    if (!isYandexBackendProxyEnabled()) {
        return disabledResponse();
    }

    const { path } = await context.params;

    try {
        return await proxySupabaseGatewayRequest(request, path);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Supabase gateway proxy failed';
        return Response.json({ error: message }, { status: 502 });
    }
};

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
export const HEAD = handleRequest;
export const OPTIONS = handleRequest;
