// Серверная читалка занятости из Google-таблицы отельера (для голубой шахматки
// и кнопки «Обновить»). Без новых зависимостей: JWT подписываем через node:crypto,
// токен получаем у oauth2.googleapis.com, данные — Sheets API v4.
//
// Два формата таблиц-шахматок:
//   • 'merge'  — бронь = объединённая ячейка (Санрайз): дни в строке-шапке,
//     номер в столбце A, merge покрывает колонки-дни.
//   • 'color'  — бронь = ЦВЕТ фона ячеек (Фемели): каждый номер = блок из ~5
//     строк, занятый день = день-колонка с непустой заливкой в любой строке блока.

import { createSign } from 'node:crypto';

const NIGHT = 86400;
const DAY_MS = 86400000;

export type GoogleSheetSource = {
    system: 'googlesheet';
    /** тег меток: external_source (совпадает с кроном, чтобы не конфликтовать). */
    tag: string;
    sheetId: string;
    mode: 'merge' | 'color';
    /** merge: строка с днями (0-индекс). color: не используется (шапка = первая строка блока). */
    headerRow: number;
    /** название листа → номер месяца (1-12). */
    months: Record<string, number>;
    /** подпись метки-занятости. */
    guest: string;
    year: number;
    /** regex для извлечения номера из НАШЕГО названия номера (для syncMirror). */
    roomTitleRegex: string;
    /** merge: значение в столбце A → номер нашего номера. */
    roomMap?: Record<string, number>;
    /** color: префикс метки блока в столбце A (напр. 'ДОМИК'). */
    labelPrefix?: string;
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

type Cell = { formattedValue?: string; effectiveFormat?: { backgroundColor?: { red?: number; green?: number; blue?: number } } };
type RawSheet = {
    properties?: { title?: string };
    merges?: Array<{
        startRowIndex?: number;
        endRowIndex?: number;
        startColumnIndex?: number;
        endColumnIndex?: number;
    }>;
    data?: Array<{ rowData?: Array<{ values?: Cell[] }> }>;
};

// Заезд 14:00 МСК = 11:00 UTC; выезд 12:00 МСК = 09:00 UTC.
const checkinUnix = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d, 11) / 1000);
const checkoutUnix = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d, 9) / 1000);

const gridOf = (sheet: RawSheet): Cell[][] => {
    const rows = sheet.data?.[0]?.rowData ?? [];
    return rows.map((row) => row.values ?? []);
};
const text = (cell?: Cell) => (cell?.formattedValue ?? '').trim();
const isWhite = (bg?: { red?: number; green?: number; blue?: number }) =>
    !bg || ((bg.red ?? 1) > 0.93 && (bg.green ?? 1) > 0.93 && (bg.blue ?? 1) > 0.93);

// ---------- MERGE (Санрайз) ----------
const fetchWholeSpreadsheet = async (token: string, sheetId: string): Promise<RawSheet[]> => {
    const fields = 'sheets(properties(title),merges,data(rowData(values(formattedValue))))';
    const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}` +
        `?includeGridData=true&fields=${encodeURIComponent(fields)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Google Sheets: ${response.status}`);
    }
    const json = (await response.json()) as { sheets?: RawSheet[] };
    return json.sheets ?? [];
};

const parseMergeSheet = (source: GoogleSheetSource, sheet: RawSheet): SheetStay[] => {
    const title = sheet.properties?.title ?? '';
    const month = source.months[title];
    if (!month) return [];
    const grid = gridOf(sheet);
    const header = grid[source.headerRow] ?? [];
    const roomMap = source.roomMap ?? {};

    const colToDay = new Map<number, number>();
    let prev = 0;
    const daysInMonth = new Date(Date.UTC(source.year, month, 0)).getUTCDate();
    for (let c = 0; c < header.length; c += 1) {
        const v = text(header[c]);
        if (!/^\d+$/.test(v)) continue;
        const d = Number(v);
        if (d < prev || d < 1 || d > daysInMonth) break;
        colToDay.set(c, d);
        prev = d;
    }
    const rowToRoom = new Map<number, number>();
    for (let r = source.headerRow + 1; r < grid.length; r += 1) {
        const key = text(grid[r]?.[0]);
        if (key in roomMap) rowToRoom.set(r, roomMap[key]);
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
            const d = colToDay.get(c);
            if (d !== undefined) days.push(d);
        }
        if (days.length === 0) continue;
        const first = Math.min(...days);
        const last = Math.max(...days);
        stays.push({
            roomNumber,
            start: checkinUnix(source.year, month, first),
            end: checkoutUnix(source.year, month, last + 1),
        });
    }
    return stays;
};

// ---------- COLOR (Фемели) ----------
const fetchRange = async (token: string, sheetId: string, range: string): Promise<RawSheet | null> => {
    const fields = 'sheets(properties(title),data(rowData(values(formattedValue,effectiveFormat(backgroundColor)))))';
    const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}` +
        `?includeGridData=true&ranges=${encodeURIComponent(range)}&fields=${encodeURIComponent(fields)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) return null;
    const json = (await response.json()) as { sheets?: RawSheet[] };
    return json.sheets?.[0] ?? null;
};

// Накопить занятые дни (полночь UTC, мс) по номеру для одного месяца.
const accumulateColor = (
    source: GoogleSheetSource,
    sheet: RawSheet,
    month: number,
    occ: Map<number, Set<number>>,
) => {
    const grid = gridOf(sheet);
    const prefix = (source.labelPrefix ?? '').toUpperCase();
    const blocks: Array<{ row: number }> = [];
    for (let r = 0; r < grid.length; r += 1) {
        if (text(grid[r]?.[0]).toUpperCase().startsWith(prefix)) blocks.push({ row: r });
    }
    for (let bi = 0; bi < blocks.length; bi += 1) {
        const sr = blocks[bi].row;
        const label = text(grid[sr][0]).toUpperCase();
        const numMatch = /(\d+)/.exec(label);
        if (!numMatch) continue;
        const roomNumber = Number(numMatch[1]);
        const er = bi + 1 < blocks.length ? blocks[bi + 1].row : sr + 5;
        // дни — из первой строки блока
        const header = grid[sr] ?? [];
        const colToDay = new Map<number, number>();
        let prev = 0;
        const daysInMonth = new Date(Date.UTC(source.year, month, 0)).getUTCDate();
        for (let c = 1; c < header.length; c += 1) {
            const v = text(header[c]);
            if (!/^\d+$/.test(v)) continue;
            const d = Number(v);
            if (d < prev || d < 1 || d > daysInMonth) break;
            colToDay.set(c, d);
            prev = d;
        }
        let set = occ.get(roomNumber);
        if (!set) {
            set = new Set();
            occ.set(roomNumber, set);
        }
        for (let r = sr; r < er && r < grid.length; r += 1) {
            const row = grid[r] ?? [];
            for (const [c, day] of colToDay) {
                if (c < row.length && !isWhite(row[c]?.effectiveFormat?.backgroundColor)) {
                    set.add(Date.UTC(source.year, month - 1, day));
                }
            }
        }
    }
};

// Склеить занятые дни (мс) в интервалы заезд-выезд.
const coalesce = (occ: Map<number, Set<number>>): SheetStay[] => {
    const stays: SheetStay[] = [];
    for (const [roomNumber, daysSet] of occ) {
        const days = [...daysSet].sort((a, b) => a - b);
        let i = 0;
        while (i < days.length) {
            let j = i;
            while (j + 1 < days.length && days[j + 1] - days[j] === DAY_MS) j += 1;
            const first = new Date(days[i]);
            const lastPlus = new Date(days[j] + DAY_MS);
            stays.push({
                roomNumber,
                start: checkinUnix(first.getUTCFullYear(), first.getUTCMonth() + 1, first.getUTCDate()),
                end: checkoutUnix(lastPlus.getUTCFullYear(), lastPlus.getUTCMonth() + 1, lastPlus.getUTCDate()),
            });
            i = j + 1;
        }
    }
    return stays;
};

export const readGoogleSheetOccupancy = async (source: GoogleSheetSource): Promise<SheetStay[]> => {
    const sa = loadServiceAccount();
    const token = await getAccessToken(sa);

    if (source.mode === 'color') {
        const occ = new Map<number, Set<number>>();
        for (const [title, month] of Object.entries(source.months)) {
            const sheet = await fetchRange(token, source.sheetId, `${title}!A1:AF160`);
            if (sheet) accumulateColor(source, sheet, month, occ);
        }
        return coalesce(occ);
    }

    const sheets = await fetchWholeSpreadsheet(token, source.sheetId);
    return sheets.flatMap((sheet) => parseMergeSheet(source, sheet));
};

export { NIGHT };
