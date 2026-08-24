// Серверная читалка занятости отеля «Грант» из файла-шахматки .xlsx.
//
// Отельер ведёт сетку в OneDrive, куда наш сервер попасть не может: ссылка
// требует личной сессии Microsoft. Поэтому файл кладут в папку Google Drive,
// открытую нашему сервис-аккаунту на чтение, а мы берём оттуда САМЫЙ СВЕЖИЙ
// файл. Обновление занятости = положить в папку новую выгрузку.
//
// Как устроена книга (проверено на боевом файле «ГО сетка 2026»):
//   • строка 2 — месяц (объединён на весь месяц), строка 3 — число;
//     сетка идёт с мая 2026 по апрель 2027, поэтому год переводим на убыли
//     номера месяца;
//   • столбец A — раздел («1 ЭТАЖ Стд», «Коттедж (доп)», «ВИП», «Эконом»),
//     столбец B — название номера;
//   • бронь = ОБЪЕДИНЁННАЯ ячейка с текстом; объединение по вертикали значит
//     бронь сразу на несколько номеров (компания заняла два коттеджа);
//   • объединение покрывает НОЧИ. День выезда остаётся вне объединения — его
//     отельер помечает фиолетовым квадратом, и он должен остаться свободным.
//     Отдельно цвет читать не нужно: выезд = последняя ночь + 1.
//
// Раздел «Эконом» отель нам не продаёт — пропускаем целиком.

import * as XLSX from '@e965/xlsx';

import { DRIVE_READONLY_SCOPE, getGoogleAccessToken } from './googleServiceAccount';

const MONTHS: Readonly<Record<string, number>> = {
    'январь': 1, 'февраль': 2, 'март': 3, 'апрель': 4, 'май': 5, 'июнь': 6,
    'июль': 7, 'август': 8, 'сентябрь': 9, 'октябрь': 10, 'ноябрь': 11, 'декабрь': 12,
};

const EXCLUDED_SECTION_RE = /эконом/i;

export type GrantXlsxSource = {
    system: 'grantxlsx';
    /** тег меток: external_source. */
    tag: string;
    /** подпись метки-занятости. */
    guest: string;
    /** Папка Google Drive, открытая сервис-аккаунту на чтение. */
    folderId: string;
    /** Год первого месяца сетки (сетка идёт май текущего → апрель следующего). */
    year: number;
};

export type GrantStay = {
    /** Название номера, как оно записано в столбце B книги. */
    roomLabel: string;
    /** Заезд, unix-секунды. */
    start: number;
    /** Выезд, unix-секунды (последняя ночь + 1). */
    end: number;
};

export type GrantOccupancyResult = {
    stays: GrantStay[];
    /** Названия номеров, найденные в книге (без раздела «Эконом»). */
    roomLabels: string[];
    /**
     * false, если книгу прочитать не удалось. Пустая занятость при
     * sourceComplete = false НЕ должна стирать наши метки.
     */
    sourceComplete: boolean;
    fileName: string;
    /** Когда файл последний раз обновляли в Drive (ISO). Для оповещений о протухании. */
    modifiedTime: string;
};

/**
 * Названия номеров в книге и у нас совпадают, но отельер свободно меняет
 * пробелы: «3 ч Д № 7» ↔ «3ч Д №7». Сравниваем без пробелов и регистра.
 */
export const normalizeGrantRoomLabel = (label: string): string =>
    label.toLowerCase().replace(/\s+/g, '').trim();

// Заезд 14:00 МСК = 11:00 UTC; выезд 12:00 МСК = 09:00 UTC — как в остальных зеркалах.
const checkinUnix = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d, 11) / 1000);
const checkoutUnix = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d, 9) / 1000);

type Ymd = { y: number; m: number; d: number };

const nextDay = ({ y, m, d }: Ymd): Ymd => {
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() };
};

/** Разбирает книгу-шахматку Гранта. Работает с буфером — сеть не трогает. */
export const parseGrantWorkbook = (
    buffer: ArrayBuffer | Buffer | Uint8Array,
    options: { year: number },
): { stays: GrantStay[]; roomLabels: string[] } => {
    const wb = XLSX.read(buffer, { type: 'buffer', cellStyles: true });
    const sheetName = wb.SheetNames[0];
    const ws = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!ws?.['!ref']) {
        throw new Error('Книга Гранта пустая: не найден лист с данными');
    }
    const range = XLSX.utils.decode_range(ws['!ref']);
    const merges = ws['!merges'] ?? [];
    const text = (r: number, c: number): string => {
        const cell = ws[XLSX.utils.encode_cell({ r, c })] as { v?: unknown } | undefined;
        return String(cell?.v ?? '').trim();
    };

    // --- Шапка: колонка → дата.
    const monthMerge = (c: number) =>
        merges.find((m) => m.s.r <= 1 && m.e.r >= 1 && m.s.c <= c && m.e.c >= c);
    const dateByCol = new Map<number, Ymd>();
    let year = options.year;
    let prevMonth = 0;
    for (let c = 2; c <= range.e.c; c += 1) {
        const mm = monthMerge(c);
        const monthName = (mm ? text(mm.s.r, mm.s.c) : text(1, c)).toLowerCase();
        const month = MONTHS[monthName];
        const day = Number(text(2, c));
        if (!month || !Number.isInteger(day) || day < 1 || day > 31) continue;
        // Номер месяца пошёл на убыль — сетка перешла в следующий год.
        if (prevMonth && month < prevMonth) year += 1;
        prevMonth = month;
        dateByCol.set(c, { y: year, m: month, d: day });
    }
    if (dateByCol.size === 0) {
        throw new Error('В книге Гранта не разобралась шапка дат');
    }

    // --- Номера: столбец A задаёт раздел, столбец B — название номера.
    const roomByRow = new Map<number, string>();
    let section = '';
    for (let r = 3; r <= range.e.r; r += 1) {
        const sectionCell = text(r, 0);
        if (sectionCell) section = sectionCell;
        const label = text(r, 1);
        if (!label) continue;
        if (EXCLUDED_SECTION_RE.test(section)) continue;
        roomByRow.set(r, label);
    }
    if (roomByRow.size === 0) {
        throw new Error('В книге Гранта не нашлось ни одного номера');
    }

    const toStay = (roomLabel: string, from: Ymd, lastNight: Ymd): GrantStay => {
        const checkout = nextDay(lastNight);
        return {
            roomLabel,
            start: checkinUnix(from.y, from.m, from.d),
            end: checkoutUnix(checkout.y, checkout.m, checkout.d),
        };
    };

    const stays: GrantStay[] = [];
    const covered = new Set<string>();

    for (const m of merges) {
        if (m.s.c < 2) continue;
        for (let r = m.s.r; r <= m.e.r; r += 1) {
            for (let c = m.s.c; c <= m.e.c; c += 1) covered.add(`${r}:${c}`);
        }
        // Текст объединения лежит в его левой верхней ячейке.
        if (!text(m.s.r, m.s.c)) continue;
        const from = dateByCol.get(m.s.c);
        const lastNight = dateByCol.get(m.e.c);
        if (!from || !lastNight) continue;
        for (let r = m.s.r; r <= m.e.r; r += 1) {
            const roomLabel = roomByRow.get(r);
            if (roomLabel) stays.push(toStay(roomLabel, from, lastNight));
        }
    }

    // Бронь на одну ночь объединением не оформляют — это одиночная ячейка с текстом.
    for (const [r, roomLabel] of roomByRow) {
        for (let c = 2; c <= range.e.c; c += 1) {
            if (covered.has(`${r}:${c}`)) continue;
            if (!text(r, c)) continue;
            const day = dateByCol.get(c);
            if (!day) continue;
            stays.push(toStay(roomLabel, day, day));
        }
    }

    return { stays, roomLabels: [...new Set(roomByRow.values())] };
};

type DriveFile = { id: string; name: string; modifiedTime: string };

/** Самый свежий .xlsx в папке Drive. */
const findNewestWorkbook = async (folderId: string, token: string): Promise<DriveFile> => {
    const query = `'${folderId}' in parents and trashed = false`;
    const url =
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}` +
        '&orderBy=modifiedTime desc&pageSize=25&fields=files(id,name,mimeType,modifiedTime)';
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
    });
    if (!response.ok) {
        throw new Error(`Google Drive: ${response.status} при чтении папки`);
    }
    const json = (await response.json()) as { files?: Array<DriveFile & { mimeType?: string }> };
    const workbook = (json.files ?? []).find((file) => /\.xlsx$/i.test(file.name));
    if (!workbook) {
        // Пустая папка — это сломанный источник, а НЕ «отель полностью свободен».
        throw new Error(
            'В папке Google Drive нет файла .xlsx — положите выгрузку шахматки Гранта в папку',
        );
    }
    return { id: workbook.id, name: workbook.name, modifiedTime: workbook.modifiedTime };
};

export const readGrantOccupancy = async (source: GrantXlsxSource): Promise<GrantOccupancyResult> => {
    const token = await getGoogleAccessToken(DRIVE_READONLY_SCOPE);
    const file = await findNewestWorkbook(source.folderId, token);

    const download = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    if (!download.ok) {
        throw new Error(`Google Drive: ${download.status} при скачивании «${file.name}»`);
    }
    const buffer = Buffer.from(await download.arrayBuffer());
    const { stays, roomLabels } = parseGrantWorkbook(buffer, { year: source.year });

    return {
        stays,
        roomLabels,
        sourceComplete: true,
        fileName: file.name,
        modifiedTime: file.modifiedTime,
    };
};
