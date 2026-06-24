/**
 * Сверка всех вкладок «БРОНИ-2026. список из ваучеров» с бронями в Supabase.
 * Только отчёт, без изменений в БД.
 *
 * Google: service account JSON (Downloads/sonorous-bounty-488706-q9-*.json)
 * node scripts/reconcile-bookings-sheet.cjs
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');

const SPREADSHEET_ID = '1XiOl2hSYsVpWSRW3gjEm7rNwhmpVx8gGHka3EbvSvtE';
const SKIP_SHEETS = new Set(['ИСТОРИЯ ДЕЙСТВИЙ', 'ОТЗЫВЫ 2026']);
const YEAR = 2026;
const OUT_FILE = path.join(__dirname, '..', 'bookings-sheet-reconciliation.txt');

function readEnvLocal() {
    const p = path.join(__dirname, '..', '.env.local');
    if (!fs.existsSync(p)) return {};
    const o = {};
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) o[m[1].trim()] = m[2].trim();
    }
    return o;
}

function findServiceAccountKey() {
    const downloads = path.join(process.env.HOME || '', 'Downloads');
    if (!fs.existsSync(downloads)) return null;
    const files = fs.readdirSync(downloads).filter(
        (f) => f.includes('sonorous-bounty') && f.endsWith('.json'),
    );
    return files.length ? path.join(downloads, files[0]) : null;
}

function normalizeTitle(s) {
    return (s || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[“”"«»()\-.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normPhone(p) {
    const d = (p || '').replace(/\D/g, '');
    if (!d) return '';
    let n = d;
    if (n.startsWith('8') && n.length === 11) n = '7' + n.slice(1);
    if (n.length === 10) n = '7' + n;
    return n.slice(-10);
}

function normGuest(g) {
    return normalizeTitle(g).replace(/\s+/g, ' ');
}

const MONTHS = {
    январь: 1,
    февраль: 2,
    март: 3,
    апрель: 4,
    май: 5,
    июнь: 6,
    июль: 7,
    август: 8,
    сентябрь: 9,
    октябрь: 10,
    ноябрь: 11,
    декабрь: 12,
};

function parseDatePart(part, defaultMonth) {
    const s = (part || '').trim().replace(/\s/g, '');
    const m1 = s.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
    if (m1) {
        const day = +m1[1];
        const month = +m1[2];
        const year = m1[3] ? (+m1[3] < 100 ? 2000 + +m1[3] : +m1[3]) : YEAR;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    const m2 = s.match(/^(\d{1,2})$/);
    if (m2 && defaultMonth) {
        const day = +m2[1];
        return `${YEAR}-${String(defaultMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
}

function parseBookingDates(raw, monthHint) {
    const text = (raw || '').trim();
    if (!text) return null;
    const hintMonth = MONTHS[(monthHint || '').toLowerCase().trim()];

    const full = text.match(/^(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)\s*[-–—]\s*(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)$/);
    if (full) {
        const start = parseDatePart(full[1]);
        const end = parseDatePart(full[2]);
        if (start && end) return { start, end };
    }

    const mixed = text.match(/^(\d{1,2}\.\d{1,2})\s*[-–—]\s*(\d{1,2}\.\d{1,2})$/);
    if (mixed) {
        const start = parseDatePart(mixed[1]);
        const end = parseDatePart(mixed[2]);
        if (start && end) return { start, end };
    }

    const short = text.match(/^(\d{1,2})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})$/);
    if (short) {
        const month = +short[3];
        const start = parseDatePart(short[1], month);
        const end = parseDatePart(short[2], month);
        if (start && end) return { start, end };
    }

    const cross = text.match(/^(\d{1,2})\.(\d{1,2})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})$/);
    if (cross) {
        const start = parseDatePart(`${cross[1]}.${cross[2]}`);
        const end = parseDatePart(`${cross[3]}.${cross[4]}`);
        if (start && end) return { start, end };
    }

    if (hintMonth) {
        const hm = text.match(/^(\d{1,2})\s*[-–—]\s*(\d{1,2})$/);
        if (hm) {
            const start = parseDatePart(hm[1], hintMonth);
            const end = parseDatePart(hm[2], hintMonth);
            if (start && end) return { start, end };
        }
    }

    return null;
}

function nightsBetween(start, end) {
    const a = new Date(start + 'T12:00:00');
    const b = new Date(end + 'T12:00:00');
    return Math.round((b - a) / 86400000);
}

function scoreHotelMatch(a, b) {
    const na = normalizeTitle(a);
    const nb = normalizeTitle(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.85;
    const wa = new Set(na.split(' ').filter((w) => w.length > 2));
    const wb = new Set(nb.split(' ').filter((w) => w.length > 2));
    let hit = 0;
    for (const w of wa) if (wb.has(w)) hit++;
    return hit / Math.max(wa.size, wb.size, 1);
}

function findHotelForObject(objectName, sheetName, hotels) {
    const candidates = [];
    const obj = normalizeTitle(objectName || sheetName);
    const sheet = normalizeTitle(sheetName);

    for (const h of hotels) {
        const ht = normalizeTitle(h.title);
        let score = scoreHotelMatch(obj, h.title);
        if (objectName) {
            score = Math.max(score, scoreHotelMatch(obj, h.title));
        } else {
            score = Math.max(score, scoreHotelMatch(sheet, h.title));
        }
        if (score >= 0.45) candidates.push({ hotel: h, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
}

function isTechnicalGuest(g) {
    const n = normGuest(g);
    return ['занят', 'занято', 'занята', 'занят'].some((x) => n === x || n.startsWith(x));
}

function compareBooking(sheetRow, reserve) {
    const issues = [];
    if (sheetRow.start !== reserve.startDate) issues.push(`даты начала: табл ${sheetRow.start} / программа ${reserve.startDate}`);
    if (sheetRow.end !== reserve.endDate) issues.push(`даты конца: табл ${sheetRow.end} / программа ${reserve.endDate}`);
    if (sheetRow.nights && reserve.nights && +sheetRow.nights !== +reserve.nights)
        issues.push(`ночей: табл ${sheetRow.nights} / программа ${reserve.nights}`);
    if (sheetRow.people && reserve.quantity && +sheetRow.people !== +reserve.quantity)
        issues.push(`гостей: табл ${sheetRow.people} / программа ${reserve.quantity}`);
    if (sheetRow.rate && reserve.price && +sheetRow.rate !== +reserve.price)
        issues.push(`тариф: табл ${sheetRow.rate} / программа ${reserve.price}`);
    if (sheetRow.prepay && reserve.prepayment && String(+sheetRow.prepay) !== String(+reserve.prepayment))
        issues.push(`предоплата: табл ${sheetRow.prepay} / программа ${reserve.prepayment}`);
    const sg = normGuest(sheetRow.guest);
    const rg = normGuest(reserve.guest);
    if (sg && rg && !rg.includes(sg.split(' ')[0]) && !sg.includes(rg.split(' ')[0]))
        issues.push(`ФИО: табл «${sheetRow.guest}» / программа «${reserve.guest}»`);
    return issues;
}

async function loadSheetData(auth) {
    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        fields: 'sheets.properties(title,sheetId)',
    });
    const allSheets = meta.data.sheets
        .map((s) => s.properties.title)
        .filter((t) => !SKIP_SHEETS.has(t));

    const rowsBySheet = {};
    for (const title of allSheets) {
        const range = `'${title.replace(/'/g, "''")}'!A1:M200`;
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range,
            majorDimension: 'ROWS',
        });
        const values = res.data.values || [];
        if (values.length < 2) continue;
        const header = values[0];
        const col = {};
        header.forEach((h, i) => {
            const k = normalizeTitle(h);
            if (k.includes('объект')) col.object = i;
            if (k.includes('гость') || k === 'фио') col.guest = i;
            if (k.includes('телефон')) col.phone = i;
            if (k.includes('даты брони')) col.dates = i;
            if (k.includes('месяц')) col.month = i;
            if (k.includes('суток')) col.nights = i;
            if (k.includes('чел')) col.people = i;
            if (k === 'тариф' || k.includes('тариф')) col.rate = i;
            if (k.includes('предоплата')) col.prepay = i;
        });
        if (!col.guest && !col.phone) continue;

        const bookings = [];
        for (let r = 1; r < values.length; r++) {
            const row = values[r];
            if (!row || row.every((c) => !c || !String(c).trim())) continue;
            const guest = col.guest != null ? (row[col.guest] || '').trim() : '';
            const phone = col.phone != null ? (row[col.phone] || '').trim() : '';
            if (!guest && !phone) continue;
            if (isTechnicalGuest(guest) && !phone.replace(/\D/g, '')) continue;

            const monthHint = col.month != null ? row[col.month] : '';
            const datesRaw = col.dates != null ? row[col.dates] : '';
            const parsed = parseBookingDates(datesRaw, monthHint);
            const objectName = col.object != null ? (row[col.object] || '').trim() : '';

            bookings.push({
                sheet: title,
                rowNum: r + 1,
                object: objectName,
                guest,
                phone,
                phoneNorm: normPhone(phone),
                datesRaw,
                monthHint,
                start: parsed?.start,
                end: parsed?.end,
                nights: col.nights != null ? row[col.nights] : '',
                people: col.people != null ? row[col.people] : '',
                rate: col.rate != null ? row[col.rate] : '',
                prepay: col.prepay != null ? row[col.prepay] : '',
            });
        }
        if (bookings.length) rowsBySheet[title] = bookings;
    }
    return rowsBySheet;
}

async function loadSupabaseData(url, key) {
    const supabase = createClient(url, key);
    const { data: hotels, error: hErr } = await supabase.from('hotels').select('id,title').order('title');
    if (hErr) throw hErr;

    const { data: rooms, error: rErr } = await supabase.from('rooms').select('id,hotel_id,title').order('title');
    if (rErr) throw rErr;

    let allReserves = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('reserves')
            .select('*')
            .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data?.length) break;
        allReserves.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }

    const hotelMap = Object.fromEntries(hotels.map((h) => [h.id, h.title]));
    const roomMap = Object.fromEntries(rooms.map((r) => [r.id, r]));

    const enriched = allReserves.map((r) => {
        const room = roomMap[r.room_id];
        return {
            ...r,
            hotelId: room?.hotel_id,
            hotel: hotelMap[room?.hotel_id],
            roomTitle: room?.title,
            startDate: new Date(r.start * 1000).toISOString().slice(0, 10),
            endDate: new Date(r.end * 1000).toISOString().slice(0, 10),
            nights: Math.round((r.end - r.start) / 86400),
            phoneNorm: normPhone(r.phone),
            guestNorm: normGuest(r.guest),
        };
    });

    return { hotels, rooms, reserves: enriched };
}

async function main() {
    const keyPath = findServiceAccountKey();
    if (!keyPath) throw new Error('Service account JSON not found in Downloads');

    const auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const env = readEnvLocal();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) throw new Error('Supabase credentials missing');

    console.log('Loading Google Sheet...');
    const sheetData = await loadSheetData(auth);
    console.log('Loading Supabase...');
    const { hotels, reserves } = await loadSupabaseData(supabaseUrl, serviceKey);

    const lines = [];
    const push = (s = '') => lines.push(s);

    push('ПОЛНАЯ СВЕРКА: БРОНИ-2026. список из ваучеров ↔ шахматка (Supabase)');
    push(`Дата: ${new Date().toISOString().slice(0, 10)}`);
    push(`Таблица ID: ${SPREADSHEET_ID}`);
    push(`Service account: ${JSON.parse(fs.readFileSync(keyPath, 'utf8')).client_email}`);
    push(`Отелей в программе: ${hotels.length}, броней в программе: ${reserves.length}`);
    push('');

    let totalSheetBookings = 0;
    let totalInProgramHotels = 0;
    let fullMatch = 0;
    let partialMatch = 0;
    let notFound = 0;
    let hotelNotInProgram = 0;
    let unparsedDates = 0;
    const problemRows = [];
    const sheetsWithoutHotel = new Set();
    const sheetsWithHotel = [];

    for (const [sheetName, bookings] of Object.entries(sheetData).sort((a, b) => a[0].localeCompare(b[0], 'ru'))) {
        const sampleObject = bookings.find((b) => b.object)?.object || sheetName;
        const hotelMatch = findHotelForObject(sampleObject, sheetName, hotels);

        if (!hotelMatch || hotelMatch.score < 0.5) {
            sheetsWithoutHotel.add(sheetName);
            continue;
        }

        const hotel = hotelMatch.hotel;
        const hotelReserves = reserves.filter((r) => r.hotelId === hotel.id);
        sheetsWithHotel.push({ sheetName, hotelTitle: hotel.title, matchScore: hotelMatch.score, bookings: bookings.length });

        let sheetFull = 0;
        let sheetPartial = 0;
        let sheetMissing = 0;
        let sheetNoDates = 0;

        push(`━━━ Вкладка: ${sheetName} → программа: «${hotel.title}» (совпадение ${hotelMatch.score.toFixed(2)}) ━━━`);
        push(`Броней на вкладке: ${bookings.length}, броней в программе для объекта: ${hotelReserves.length}`);
        push('');

        for (const b of bookings) {
            totalSheetBookings++;
            totalInProgramHotels++;

            if (!b.start || !b.end) {
                unparsedDates++;
                sheetNoDates++;
                problemRows.push({ ...b, hotel: hotel.title, status: 'НЕ РАСПОЗНАНЫ ДАТЫ', issues: [b.datesRaw] });
                push(`  [${b.rowNum}] ${b.guest} | даты «${b.datesRaw}» — НЕ РАСПОЗНАНЫ`);
                continue;
            }
            if (!b.nights) b.nights = nightsBetween(b.start, b.end);

            const objectForMatch = b.object || sheetName;
            const objHotel = b.object ? findHotelForObject(b.object, sheetName, hotels) : hotelMatch;
            const targetHotel = objHotel?.hotel || hotel;
            const targetReserves = reserves.filter((r) => r.hotelId === targetHotel.id);

            let candidates = targetReserves;
            if (b.phoneNorm) {
                const byPhone = candidates.filter((r) => r.phoneNorm === b.phoneNorm);
                if (byPhone.length) candidates = byPhone;
            }
            if (candidates.length > 1 && b.guest) {
                const g = normGuest(b.guest).split(' ')[0];
                const byGuest = candidates.filter((r) => r.guestNorm.includes(g));
                if (byGuest.length) candidates = byGuest;
            }
            if (candidates.length > 1) {
                const byDate = candidates.filter((r) => r.startDate === b.start && r.endDate === b.end);
                if (byDate.length) candidates = byDate;
            }

            const match = candidates[0];
            if (!match) {
                notFound++;
                sheetMissing++;
                problemRows.push({
                    ...b,
                    hotel: targetHotel.title,
                    status: 'НЕ НАЙДЕНА В ПРОГРАММЕ',
                    issues: [],
                });
                push(
                    `  ❌ [${b.rowNum}] ${b.object ? b.object + ' — ' : ''}${b.guest} | ${b.start}–${b.end} | ${b.phone} — НЕ НАЙДЕНА`,
                );
                continue;
            }

            const issues = compareBooking(b, match);
            if (issues.length === 0) {
                fullMatch++;
                sheetFull++;
                push(`  ✅ [${b.rowNum}] ${b.guest} | ${b.start}–${b.end} — полное совпадение`);
            } else {
                partialMatch++;
                sheetPartial++;
                problemRows.push({ ...b, hotel: targetHotel.title, status: 'РАСХОЖДЕНИЯ', issues, appGuest: match.guest });
                push(`  ⚠️ [${b.rowNum}] ${b.guest} | ${b.start}–${b.end} — расхождения: ${issues.join('; ')}`);
            }
        }

        if (sheetNoDates) push(`  (не распознаны даты: ${sheetNoDates})`);
        push(`  Итог вкладки: ✅ ${sheetFull} | ⚠️ ${sheetPartial} | ❌ ${sheetMissing}`);
        push('');
    }

    // KVDОMA and cross-object sheets counted in loop above

    push('═══════════════════════════════════════════════════════════');
    push('СВОДКА');
    push('═══════════════════════════════════════════════════════════');
    push(`Вкладок с бронями (без ИСТОРИЯ/ОТЗЫВЫ): ${Object.keys(sheetData).length}`);
    push(`Вкладок сопоставлено с объектами в программе: ${sheetsWithHotel.length}`);
    push(`Вкладок БЕЗ объекта в программе: ${sheetsWithoutHotel.size}`);
    push(`Броней на сопоставленных вкладках: ${totalInProgramHotels}`);
    push(`  ✅ Полное совпадение: ${fullMatch}`);
    push(`  ⚠️ С расхождениями: ${partialMatch}`);
    push(`  ❌ Не найдено в программе: ${notFound}`);
    push(`  ? Не распознаны даты: ${unparsedDates}`);
    push('');

    if (sheetsWithoutHotel.size) {
        push('Вкладки без объекта в программе (первые 40):');
        [...sheetsWithoutHotel].sort((a, b) => a.localeCompare(b, 'ru')).slice(0, 40).forEach((s) => {
            const cnt = sheetData[s]?.length || 0;
            push(`  - ${s} (${cnt} броней)`);
        });
        if (sheetsWithoutHotel.size > 40) push(`  ... и ещё ${sheetsWithoutHotel.size - 40}`);
        push('');
    }

    push('КРИТИЧНЫЕ РАСХОЖДЕНИЯ (первые 80):');
    problemRows
        .filter((p) => p.status !== 'НЕ РАСПОЗНАНЫ ДАТЫ')
        .slice(0, 80)
        .forEach((p) => {
            push(
                `  ${p.sheet} [${p.rowNum}] «${p.hotel}» ${p.guest} | ${p.start || '?'}–${p.end || '?'} | ${p.status}: ${(p.issues || []).join('; ')}`,
            );
        });

    fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
    console.log(`Written ${OUT_FILE}`);
    console.log(`Summary: full=${fullMatch} partial=${partialMatch} missing=${notFound} noHotelTabs=${sheetsWithoutHotel.size}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
