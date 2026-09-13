import { describe, expect, it } from 'vitest';

import {
    bearerOf,
    buildWebhookUrl,
    maskForeignUri,
    maskToken,
    parseCurrentWebhook,
    sameWebhookTarget,
    sanitizeHeaders,
    tokenMatches,
    webhookBaseUrl,
} from './security';

const TOKEN = 'secret-token-123';

describe('токен вебхука', () => {
    it('подходит в query, как Bearer или в заголовке', () => {
        expect(tokenMatches(TOKEN, { query: TOKEN })).toBe(true);
        expect(tokenMatches(TOKEN, { authorization: `Bearer ${TOKEN}` })).toBe(true);
        expect(tokenMatches(TOKEN, { header: TOKEN })).toBe(true);
    });

    it('неверный токен не пускает, даже если в другом месте мусор', () => {
        expect(tokenMatches(TOKEN, { query: 'wrong' })).toBe(false);
        expect(tokenMatches(TOKEN, { query: `${TOKEN}x`, authorization: 'Bearer crm-key' })).toBe(false);
        expect(tokenMatches(TOKEN, {})).toBe(false);
    });

    it('Bearer чужого crmKey не мешает верному токену в query', () => {
        expect(tokenMatches(TOKEN, { query: TOKEN, authorization: 'Bearer other' })).toBe(true);
    });

    it('токен не задан на сервере — не пускает никого', () => {
        expect(tokenMatches(undefined, { query: '' })).toBe(false);
        expect(tokenMatches('', { query: '' })).toBe(false);
    });

    it('Bearer разбирается без учёта регистра', () => {
        expect(bearerOf('bearer abc')).toBe('abc');
        expect(bearerOf('Basic abc')).toBeNull();
        expect(bearerOf(null)).toBeNull();
    });
});

describe('заголовки для журнала', () => {
    it('без авторизации, cookie и токена в значениях', () => {
        const clean = sanitizeHeaders(
            [
                ['Authorization', `Bearer ${TOKEN}`],
                ['Cookie', 'sb=1'],
                ['X-Wazzup-Token', TOKEN],
                ['X-Original-Uri', `/api/wazzup/webhook?token=${TOKEN}&a=1`],
                ['X-Echo', `prefix ${TOKEN} suffix`],
                ['User-Agent', 'Wazzup'],
            ],
            [TOKEN, undefined],
        );
        expect(clean).toEqual({
            'x-original-uri': '/api/wazzup/webhook?token=***&a=1',
            'x-echo': 'prefix *** suffix',
            'user-agent': 'Wazzup',
        });
        expect(JSON.stringify(clean)).not.toContain(TOKEN);
    });

    it('маска токена в адресе', () => {
        expect(maskToken('https://x.ru/api/wazzup/webhook?token=abc&b=2')).toBe('https://x.ru/api/wazzup/webhook?token=***&b=2');
    });
});

describe('адрес вебхука', () => {
    it('только из переменной, только https и без параметров', () => {
        expect(webhookBaseUrl('https://d5d.apigw.yandexcloud.net/')).toBe('https://d5d.apigw.yandexcloud.net');
        expect(webhookBaseUrl('  https://abhaz.ru/app/ ')).toBe('https://abhaz.ru/app');
        expect(webhookBaseUrl(undefined)).toBeNull();
        expect(webhookBaseUrl('')).toBeNull();
        expect(webhookBaseUrl('http://abhaz.ru')).toBeNull();
        expect(webhookBaseUrl('https://abhaz.ru/?x=1')).toBeNull();
        expect(webhookBaseUrl('не адрес')).toBeNull();
    });

    it('токен кодируется', () => {
        expect(buildWebhookUrl('https://a.ru/', 'a b&c')).toBe('https://a.ru/api/wazzup/webhook?token=a%20b%26c');
    });

    it('наш адрес узнаётся и со старым токеном; чужой — нет', () => {
        const ours = buildWebhookUrl('https://a.ru', 'new');
        expect(sameWebhookTarget('https://a.ru/api/wazzup/webhook?token=old', ours)).toBe(true);
        expect(sameWebhookTarget('https://crm.example.org/api/wazzup/webhook?token=new', ours)).toBe(false);
        expect(sameWebhookTarget('https://a.ru/other', ours)).toBe(false);
        expect(sameWebhookTarget('мусор', ours)).toBe(false);
    });

    it('текущий адрес читается только из ожидаемой формы ответа', () => {
        expect(parseCurrentWebhook({ webhooksUri: ' https://a.ru/hook ', subscriptions: {} })).toEqual({
            ok: true,
            uri: 'https://a.ru/hook',
        });
        expect(parseCurrentWebhook({ webhooksUri: null })).toEqual({ ok: true, uri: '' });
        expect(parseCurrentWebhook({})).toEqual({ ok: true, uri: '' });
        expect(parseCurrentWebhook({ subscriptions: { messagesAndStatuses: false } })).toEqual({ ok: true, uri: '' });
        // Неожиданное — ничего не менять.
        expect(parseCurrentWebhook([{ webhooksUri: 'https://a.ru' }])).toEqual({ ok: false });
        expect(parseCurrentWebhook({ data: { webhooksUri: 'https://a.ru' } })).toEqual({ ok: false });
        expect(parseCurrentWebhook({ webhooksUri: 42 })).toEqual({ ok: false });
        expect(parseCurrentWebhook(42)).toEqual({ ok: false });
        expect(parseCurrentWebhook('<html>OK</html>')).toEqual({ ok: false });
        expect(parseCurrentWebhook(null)).toEqual({ ok: false });
    });

    it('чужой адрес показывается без параметров и хвоста пути', () => {
        expect(maskForeignUri('https://crm.example.org/hooks/wazzup/abc?key=SECRET')).toBe('crm.example.org/hooks/wazzu…');
        expect(maskForeignUri('https://crm.example.org/?key=SECRET')).toBe('crm.example.org');
        expect(maskForeignUri('crm.example.org/hook?key=SECRET')).toBe('crm.example.org/hook');
        expect(maskForeignUri('https://crm.example.org/hooks?key=SECRET')).not.toContain('SECRET');
    });
});
