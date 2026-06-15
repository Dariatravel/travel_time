import { NextResponse } from 'next/server';

export const isYandexBackendProxyEnabled = () => {
    return process.env.YANDEX_BACKEND_PROXY_ENABLED === 'true';
};

export const disabledResponse = () => {
    return NextResponse.json(
        { error: 'Yandex backend proxy is disabled' },
        { status: 404 },
    );
};
