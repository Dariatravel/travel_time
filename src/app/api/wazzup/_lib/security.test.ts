import { describe, expect, it } from 'vitest';

import { bearerOf, buildWebhookUrl, maskToken, publicBaseUrl, sanitizeHeaders, tokenMatches } from './security';

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
    const headers = (map: Record<string, string>) => (name: string) => map[name] ?? null;

    it('переменная окружения важнее заголовков', () => {
        expect(publicBaseUrl('https://abhaz.ru/', headers({ host: 'other' }), 'http://localhost:3000')).toBe('https://abhaz.ru');
    });

    it('заголовки шлюза', () => {
        expect(
            publicBaseUrl(
                undefined,
                headers({ 'x-forwarded-host': 'd5d.apigw.yandexcloud.net, inner', 'x-forwarded-proto': 'https', host: 'inner:8080' }),
                'http://inner:8080',
            ),
        ).toBe('https://d5d.apigw.yandexcloud.net');
    });

    it('кривой хост — адрес самого запроса', () => {
        expect(publicBaseUrl(undefined, headers({ host: 'evil.ru/path?x' }), 'http://localhost:3000')).toBe('http://localhost:3000');
    });

    it('токен кодируется', () => {
        expect(buildWebhookUrl('https://a.ru/', 'a b&c')).toBe('https://a.ru/api/wazzup/webhook?token=a%20b%26c');
    });
});
