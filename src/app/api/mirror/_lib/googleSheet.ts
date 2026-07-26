// Серверная читалка занятости из Google-таблицы отельера (для голубой шахматки
// и кнопки «Обновить»). Без новых зависимостей: JWT подписываем через node:crypto,
// токен получаем у oauth2.googleapis.com, данные — Sheets API v4 (значения+merges).
//
// Таблица-шахматка: лист = месяц; строка-шапка = дни (в конце месяца бывает
// колонка «1» = 1-е следующего — отсекаем на убывании дня); столбец A = номер;
// бронь = объединённая ячейка (merge), покрывающая колонки-дни.

import { createSign } from 'node:crypto';

const NIGHT = 86400;

export type GoogleSheetSource = {
    system: 'googlesheet';
    /** тег меток: external_source (совпадает с кроном, чтобы не конфликтовать). */
    tag: string;
    sheetId: string;
    /** строка с днями (0-индекс). */
    headerRow: number;
    /** название листа → номер месяца (1-12). */
    months: Record<string, number>;
    /** значение в столбце A (номер в таблице) → номер нашего номера. */
    roomMap: Record<string, number>;
    /** подпись метки-занятости. */
    guest: string;
    year: number;
};

export type SheetStay = { roomNumber: number; start: number; end: number };

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

const getAccessToken = async (sa: ServiceAccount): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64url(
        JSON.stringify({
            iss: sa.client_email,
            scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
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

type RawSheet = {
    properties?: { title?: string };
    merges?: Array<{
        startRowIndex?: number;
        endRowIndex?: number;
        startColumnIndex?: number;
        endColumnIndex?: number;
    }>;
    data?: Array<{ rowData?: Array<{ values?: Array<{ formattedValue?: string }> }> }>;
};

const fetchSheets = async (token: string, sheetId: string): Promise<RawSheet[]> => {
    const fields = 'sheets(properties(title),merges,data(rowData(values(formattedValue))))';
    const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}` +
        `?includeGridData=true&fields=${encodeURIComponent(fields)}`;
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
    });
    if (!response.ok) {
        throw new Error(`Google Sheets: ${response.status}`);
    }
    const json = (await response.json()) as { sheets?: RawSheet[] };
    return json.sheets ?? [];
};

// Заезд 14:00 МСК = 11:00 UTC; выезд 12:00 МСК = 09:00 UTC.
const checkinUnix = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d, 11) / 1000);
const checkoutUnix = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d, 9) / 1000);

const gridOf = (sheet: RawSheet): string[][] => {
    const rows = sheet.data?.[0]?.rowData ?? [];
    return rows.map((row) => (row.values ?? []).map((cell) => (cell.formattedValue ?? '').trim()));
};

const parseSheet = (source: GoogleSheetSource, sheet: RawSheet): SheetStay[] => {
    const title = sheet.properties?.title ?? '';
    const month = source.months[title];
    if (!month) return [];
    const grid = gridOf(sheet);
    const header = grid[source.headerRow] ?? [];

    // колонка → дата (первый возрастающий прогон; на убывании дня — стоп)
    const colToDate = new Map<number, { d: number }>();
    let prev = 0;
    for (let c = 0; c < header.length; c += 1) {
        const v = header[c];
        if (!/^\d+$/.test(v)) continue;
        const d = Number(v);
        if (d < prev) break;
        const daysInMonth = new Date(Date.UTC(source.year, month, 0)).getUTCDate();
        if (d < 1 || d > daysInMonth) break;
        colToDate.set(c, { d });
        prev = d;
    }

    // строка → номер нашего номера
    const rowToRoom = new Map<number, number>();
    for (let r = source.headerRow + 1; r < grid.length; r += 1) {
        const key = (grid[r]?.[0] ?? '').trim();
        if (key in source.roomMap) rowToRoom.set(r, source.roomMap[key]);
    }

    const stays: SheetStay[] = [];
    for (const merge of sheet.merges ?? []) {
        const sr = merge.startRowIndex ?? 0;
        if (sr <= source.headerRow) continue;
        const er = merge.endRowIndex ?? sr + 1;
        const sc = merge.startColumnIndex ?? 0;
        const ec = merge.endColumnIndex ?? sc + 1;
        let roomNumber: number | undefined;
        for (let rr = sr; rr < er; rr += 1) {
            if (rowToRoom.has(rr)) {
                roomNumber = rowToRoom.get(rr);
                break;
            }
        }
        if (roomNumber === undefined) continue;
        const days: number[] = [];
        for (let c = sc; c < ec; c += 1) {
            const cell = colToDate.get(c);
            if (cell) days.push(cell.d);
        }
        if (days.length === 0) continue;
        const first = Math.min(...days);
        const last = Math.max(...days);
        stays.push({
            roomNumber,
            start: checkinUnix(source.year, month, first),
            // выезд = день после последней занятой ночи; Date.UTC переносит месяц.
            end: checkoutUnix(source.year, month, last + 1),
        });
    }
    return stays;
};

export const readGoogleSheetOccupancy = async (source: GoogleSheetSource): Promise<SheetStay[]> => {
    const sa = loadServiceAccount();
    const token = await getAccessToken(sa);
    const sheets = await fetchSheets(token, source.sheetId);
    return sheets.flatMap((sheet) => parseSheet(source, sheet));
};

export { NIGHT };
