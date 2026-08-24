// Авторизация сервис-аккаунта Google для серверных читалок занятости.
// Без новых зависимостей: JWT подписываем через node:crypto, токен получаем
// у oauth2.googleapis.com. Ключ лежит в GOOGLE_SA_B64 (секрет), в браузер
// не попадает — модуль только серверный.

import { createSign } from 'node:crypto';

export const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

type ServiceAccount = { client_email: string; private_key: string };

const loadServiceAccount = (): ServiceAccount => {
    const b64 = process.env.GOOGLE_SA_B64;
    const raw = b64 ? Buffer.from(b64, 'base64').toString('utf8') : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
        throw new Error('GOOGLE_SA_B64 (или GOOGLE_SERVICE_ACCOUNT_JSON) не задан');
    }
    const sa = JSON.parse(raw) as ServiceAccount;
    if (!sa.client_email || !sa.private_key) {
        throw new Error('Ключ сервис-аккаунта неполный');
    }
    return sa;
};

const base64url = (input: string) => Buffer.from(input).toString('base64url');

export const getGoogleAccessToken = async (scope: string = SHEETS_READONLY_SCOPE): Promise<string> => {
    const sa = loadServiceAccount();
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64url(
        JSON.stringify({
            iss: sa.client_email,
            scope,
            aud: 'https://oauth2.googleapis.com/token',
            iat: now,
            exp: now + 3600,
        }),
    );
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claim}`);
    const signature = signer.sign(sa.private_key, 'base64url');
    const assertion = `${header}.${claim}.${signature}`;

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        cache: 'no-store',
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }),
    });
    if (!response.ok) {
        throw new Error(`Google OAuth: ${response.status}`);
    }
    const json = (await response.json()) as { access_token?: string };
    if (!json.access_token) {
        throw new Error('Google OAuth: пустой токен');
    }
    return json.access_token;
};
