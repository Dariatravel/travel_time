#!/usr/bin/env node
// Автосинхронизация занятости для ЗЕЛЁНЫХ зеркальных отелей (Shelter/FrontDesk24).
// Пока — «Студио Сан Амра» (1 номер). Логика та же, что у голубых по кнопке,
// но без перестановки броней (для 1 номера её нет): наши брони не трогаем,
// внешнюю занятость по дням дописываем метками external_source='mirror_shelter'.

import { createClient } from '@supabase/supabase-js';

const NIGHT = 86400;
const MIRROR_SOURCE_TAG = 'mirror_shelter';
const FD_AVAILABLE_DATES = 'https://pms.frontdesk24.ru/api/online/getAvailableDates';
const FD_VARIANTS = 'https://pms.frontdesk24.ru/api/online/getVariants';
const HORIZON_DAYS = 365;
const FETCH_BATCH = 8;
const transactionalIcalSyncEnabled =
    process.env.TRANSACTIONAL_ICAL_SYNC_ENABLED?.trim().toLowerCase() !== 'false';
const configuredMinRetainedRatio =
    process.env.TRANSACTIONAL_ICAL_MIN_RETAINED_RATIO?.trim() || '0.5';
const minIcalRetainedRatio = Number(configuredMinRetainedRatio);
if (!Number.isFinite(minIcalRetainedRatio) || minIcalRetainedRatio < 0 || minIcalRetainedRatio > 1) {
    throw new Error('TRANSACTIONAL_ICAL_MIN_RETAINED_RATIO должен быть числом от 0 до 1');
}
const confirmLargeIcalDecrease =
    process.env.TRANSACTIONAL_ICAL_CONFIRM_LARGE_DECREASE?.trim().toLowerCase() === 'true';

const getIcalSyncSafetyError = ({
    sourceComplete,
    confirmedEmpty,
    existingCount,
    proposedCount,
}) => {
    if (!sourceComplete) {
        return 'Источник iCal вернул неполный ответ; текущая занятость сохранена';
    }
    if (existingCount > 0 && proposedCount === 0 && !confirmedEmpty) {
        return 'Источник iCal не подтвердил пустой календарь; текущая занятость сохранена';
    }
    if (
        existingCount > 0 &&
        proposedCount > 0 &&
        proposedCount / existingCount < minIcalRetainedRatio &&
        !confirmLargeIcalDecrease
    ) {
        return `Число iCal-меток подозрительно уменьшилось: ${existingCount} -> ${proposedCount}; текущая занятость сохранена`;
    }
    return null;
};

// Авто-источники Shelter/FrontDesk24. Фоновый крон (без лимита 30с у кнопки),
// поэтому сюда вынесены и многономерные Сан Амра/Нора: читалка по кнопке на них
// упиралась в таймаут (getVariants на каждый свободный день, ~200с). Токены —
// публичные (виджет). Перестановку наших броней НЕ делаем: только дописываем
// метки занятости на свободные номера.
const AUTO_SOURCES = [
    {
        hotel: 'Студио Сан Амра',
        token: 'C16A5147-C3A7-47F6-8C2E-C4627A0B4DA1',
        widgetUrl: 'https://sun-amra.ru/book/',
        categories: [{ categoryId: 57715, roomIds: ['f328f032-b384-44f5-a522-b3bb2fee0be0'] }],
    },
    {
        hotel: 'Сан Амра  Sun Amra',
        token: 'C16A5147-C3A7-47F6-8C2E-C4627A0B4DA1',
        widgetUrl: 'https://sun-amra.ru/book/',
        categories: [
            {
                categoryId: 53918,
                roomIds: [
                    '352802ff-24e8-458f-b607-09ed6369e7dc',
                    'f224b1b9-4bcd-4936-9d3e-0c0dc975edc9',
                    '222565c4-6a5e-42ec-b576-72eb111706ad',
                    'b8975d0e-3f36-49c0-9681-ccf7b984344a',
                    'cbddcc7b-1973-4bca-8dff-dff6cc5c1b6c',
                    '9260c303-e71b-4d7a-87a1-5eded6f78b72',
                ],
            },
        ],
    },
    {
        hotel: 'Нора',
        token: '682D8F4C-AE87-4C54-B4F9-21E34254B2D5',
        widgetUrl: 'https://pms.frontdesk24.ru/onlineWidget/full.html?token=682D8F4C-AE87-4C54-B4F9-21E34254B2D5',
        categories: [
            {
                categoryId: 36753,
                roomIds: [
                    'd1210df3-28d7-4f03-9a86-ca1eb4a56ae5',
                    'a55d7d23-a2bf-49e9-829c-c090a6233db9',
                    'cdcfe88c-702a-4f05-8528-07db4aab130a',
                    'fad57533-9f12-43ce-97fe-e5ccd8779f7d',
                ],
            },
        ],
    },
];

// Источники-iCal (reservationsteps/Bnovo): публичный .ics по категориям,
// событие = интервал «в категории 0 свободных» → метки на ВСЕ строки категории.
// Строки-номера резолвим из БД по префиксу названия (создание отеля — разово).
// Аврора Inn сюда НЕ входит сознательно: она голубая (обновление по запросу —
// кнопка «Обновить занятость» + автоподтяжка при подборе), т.к. источник отдаёт
// лишь «категория занята целиком» и выдавать это за всегда-актуальное нельзя.
// Читалка/оркестратор для неё живут в src/app/api/mirror/_lib/reservationstepsIcal.ts.
const ICAL_SOURCES = [];

const isoDate = (d) => d.toISOString().slice(0, 10);
// Заезд 14:00 МСК = 11:00 UTC, выезд 12:00 МСК = 09:00 UTC.
const checkinUnix = (d) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 11) / 1000);
const checkoutUnix = (d) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9) / 1000);
const nightOf = (unix) => Math.floor(unix / NIGHT);
const dateOfNight = (night) => new Date(night * NIGHT * 1000);

// getVariants → число свободных номеров по категориям на конкретный день.
const fetchAvailableRooms = async (token, dateFrom, dateTo) => {
    const res = await fetch(FD_VARIANTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
            token,
            language: 'ru',
            dateFrom,
            dateTo,
            currency: 'RUB',
            rooms: [{ adults: 2, children: [] }],
            onlyRostourismProgram: 0,
        }),
    });
    if (!res.ok) throw new Error(`FrontDesk24 getVariants: ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json?.data) || (json.data.length > 0 && !Array.isArray(json.data[0]))) {
        throw new Error('FrontDesk24 getVariants: некорректный ответ');
    }
    const out = new Map();
    for (const item of json.data[0] ?? []) {
        const categoryId = Number(item?.id);
        const availableRooms = item?.availableRooms === undefined ? 0 : Number(item.availableRooms);
        if (!Number.isInteger(categoryId) || !Number.isFinite(availableRooms)) {
            throw new Error('FrontDesk24 getVariants: некорректная запись');
        }
        out.set(categoryId, availableRooms);
    }
    return out;
};

// getAvailableDates отдаёт СВОБОДНЫЕ даты по категориям (одним запросом) + горизонт.
// Занято = дата в горизонте, но НЕ свободна → всё занято; свободна → всего минус
// число свободных (getVariants на этот день). getVariants НЕ перечисляет полностью
// занятые категории, поэтому его считаем только по свободным дням. Многономерный
// случай (Сан Амра/Нора) — потому крон, а не кнопка (нет лимита 30с).
const readOccupancy = async (token, categories) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() + HORIZON_DAYS);

    let sourceComplete = true;
    let failedProbes = 0;
    let freeDateRows = [];
    try {
        const res = await fetch(FD_AVAILABLE_DATES, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({
                token,
                language: 'ru',
                dateFrom: isoDate(today),
                dateTo: isoDate(end),
                currency: 'RUB',
            }),
        });
        if (!res.ok) throw new Error(`FrontDesk24 getAvailableDates: ${res.status}`);
        const json = await res.json();
        if (!Array.isArray(json?.data)) {
            throw new Error('FrontDesk24 getAvailableDates: некорректный ответ');
        }
        freeDateRows = json.data;
    } catch {
        sourceComplete = false;
        failedProbes += 1;
    }

    const freeByCat = new Map();
    const maxNightByCat = new Map();
    for (const c of categories) {
        freeByCat.set(c.categoryId, new Set());
        maxNightByCat.set(c.categoryId, -1);
    }
    const freeNights = new Set();
    for (const rec of freeDateRows) {
        const categoryId = Number(rec?.roomCategoryID);
        if (
            !Number.isInteger(categoryId) ||
            typeof rec?.date !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(rec.date)
        ) {
            sourceComplete = false;
            failedProbes += 1;
            continue;
        }
        const set = freeByCat.get(categoryId);
        if (!set) continue;
        const night = nightOf(checkinUnix(new Date(`${rec.date}T00:00:00Z`)));
        set.add(night);
        freeNights.add(night);
        if (night > maxNightByCat.get(categoryId)) {
            maxNightByCat.set(categoryId, night);
        }
    }

    // Число свободных номеров на свободные дни. Любой сбой помечает весь ответ
    // неполным: RPC сохранит прежнюю занятость и запишет ошибку в sync_runs.
    const availByNight = new Map();
    const nights = [...freeNights].sort((a, b) => a - b);
    for (let i = 0; i < nights.length; i += FETCH_BATCH) {
        const chunk = nights.slice(i, i + FETCH_BATCH);
        const results = await Promise.all(
            chunk.map(async (night) => {
                const day = dateOfNight(night);
                const next = new Date(day);
                next.setUTCDate(next.getUTCDate() + 1);
                try {
                    return {
                        night,
                        avail: await fetchAvailableRooms(token, isoDate(day), isoDate(next)),
                        complete: true,
                    };
                } catch {
                    return { night, avail: new Map(), complete: false };
                }
            }),
        );
        for (const { night, avail, complete } of results) {
            if (!complete) {
                sourceComplete = false;
                failedProbes += 1;
            }
            availByNight.set(night, avail);
        }
    }

    const todayNight = nightOf(checkinUnix(today));
    const occ = new Map();
    for (const c of categories) {
        const total = c.roomIds.length;
        const free = freeByCat.get(c.categoryId);
        const maxNight = maxNightByCat.get(c.categoryId);
        if (maxNight < todayNight) {
            sourceComplete = false;
            failedProbes += 1;
        }
        const byNight = new Map();
        for (let night = todayNight; night <= maxNight; night += 1) {
            let occupied;
            if (free.has(night)) {
                const availableRooms = availByNight.get(night)?.get(c.categoryId) ?? total;
                occupied = Math.max(0, Math.min(total, total - availableRooms));
            } else {
                occupied = total;
            }
            byNight.set(night, occupied);
        }
        occ.set(c.categoryId, byNight);
    }
    const confirmedEmpty =
        sourceComplete &&
        occ.size > 0 &&
        [...occ.values()].every(
            (byNight) =>
                byNight.size > 0 && [...byNight.values()].every((occupied) => occupied === 0),
        );
    return { occupancy: occ, sourceComplete, confirmedEmpty, failedProbes };
};

const computeMarkers = (categories, ourByRoom, occ) => {
    const markers = [];
    for (const c of categories) {
        const total = c.roomIds.length;
        const markerNights = new Map(c.roomIds.map((r) => [r, new Set()]));
        for (const [night, occupied] of occ.get(c.categoryId)) {
            const target = Math.min(total, occupied);
            const ourHere = c.roomIds.filter((r) => ourByRoom.get(r)?.has(night)).length;
            let need = Math.max(0, target - ourHere);
            for (const r of c.roomIds) {
                if (need <= 0) break;
                if (ourByRoom.get(r)?.has(night)) continue;
                markerNights.get(r).add(night);
                need -= 1;
            }
        }
        for (const r of c.roomIds) {
            const nights = [...markerNights.get(r)].sort((a, b) => a - b);
            let i = 0;
            while (i < nights.length) {
                let j = i;
                while (j + 1 < nights.length && nights[j + 1] === nights[j] + 1) j += 1;
                markers.push({
                    roomId: r,
                    start: checkinUnix(dateOfNight(nights[i])),
                    end: checkoutUnix(dateOfNight(nights[j] + 1)),
                });
                i = j + 1;
            }
        }
    }
    return markers;
};

// ---- iCal reservationsteps: чтение и запись меток по категориям ----
const parseIcalEvents = (icsText) => {
    if (!icsText.includes('BEGIN:VCALENDAR') || !icsText.includes('END:VCALENDAR')) {
        return null;
    }
    const events = [];
    for (const block of icsText.split('BEGIN:VEVENT').slice(1)) {
        const m1 = /DTSTART[^:]*:(\d{8})/.exec(block);
        const m2 = /DTEND[^:]*:(\d{8})/.exec(block);
        if (!m1 || !m2) return null;
        const parse = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
        events.push({ from: parse(m1[1]), to: parse(m2[1]) });
    }
    return events;
};

const syncIcalSource = async (supabase, src) => {
    // room_ids по категориям — из БД по префиксу названия.
    const { data: hotels, error: hErr } = await supabase
        .from('hotels')
        .select('id')
        .eq('title', src.hotel)
        .limit(1);
    if (hErr || !hotels?.length) throw new Error(`отель не найден: ${src.hotel}`);
    const hotelId = hotels[0].id;
    const { data: rooms, error: rErr } = await supabase
        .from('rooms')
        .select('id, title, is_service')
        .eq('hotel_id', hotelId);
    if (rErr) throw new Error(rErr.message);
    const catRooms = new Map();
    for (const c of src.categories) {
        catRooms.set(
            c.icalId,
            (rooms ?? [])
                .filter((r) => !r.is_service && (r.title === c.titlePrefix || r.title.startsWith(c.titlePrefix + ' ')))
                .map((r) => r.id),
        );
    }
    const allRoomIds = [...catRooms.values()].flat();

    // наши брони (не метки этого источника) — их ночи не перекрываем
    const { data: reserves, error: zErr } = await supabase
        .from('reserves')
        .select('room_id, start, end, external_source')
        .in('room_id', allRoomIds);
    if (zErr) throw new Error(zErr.message);
    const ourNights = new Map(allRoomIds.map((r) => [r, new Set()]));
    const existingSourceCount = (reserves ?? []).filter((z) => z.external_source === src.tag).length;
    for (const z of reserves ?? []) {
        if (z.external_source === src.tag) continue;
        for (let n = nightOf(z.start); n < nightOf(z.end); n += 1) ourNights.get(z.room_id)?.add(n);
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const keep = (ev) => {
        if (ev.to <= today) return false; // прошлое
        if ((ev.to - ev.from) / 86400000 > 45) return false; // блок-закрытие продаж (31.12→…)
        if (ev.from > new Date(today.getTime() + 365 * 86400000)) return false;
        return true;
    };

    const markers = [];
    let sourceComplete = true;
    let sourceHasCurrentIntervals = false;
    for (const c of src.categories) {
        let events = [];
        try {
            const res = await fetch(`https://public-api.reservationsteps.ru/v1/api/ical/${c.icalId}`, { cache: 'no-store' });
            if (!res.ok) {
                sourceComplete = false;
                continue;
            }
            const parsed = parseIcalEvents(await res.text());
            if (parsed === null) {
                sourceComplete = false;
                continue;
            }
            events = parsed.filter(keep);
            if (events.length > 0) sourceHasCurrentIntervals = true;
        } catch {
            sourceComplete = false;
            continue;
        }
        for (const ev of events) {
            const from = ev.from < today ? today : ev.from;
            const start = checkinUnix(from);
            const end = checkoutUnix(ev.to);
            for (const roomId of catRooms.get(c.icalId) ?? []) {
                // не перекрываем наши брони
                let clash = false;
                for (let n = nightOf(start); n < nightOf(end); n += 1) {
                    if (ourNights.get(roomId)?.has(n)) { clash = true; break; }
                }
                if (!clash) markers.push({ roomId, start, end, icalId: c.icalId });
            }
        }
    }
    const confirmedEmpty = sourceComplete && !sourceHasCurrentIntervals;
    const safetyError = getIcalSyncSafetyError({
        sourceComplete,
        confirmedEmpty,
        existingCount: existingSourceCount,
        proposedCount: markers.length,
    });

    let inserted = 0;
    let skipped = 0;
    if (transactionalIcalSyncEnabled) {
        const { data, error: rpcError } = await supabase.rpc('sync_external_occupancy', {
            p_source: src.tag,
            p_room_ids: allRoomIds,
            p_marks: markers.map((m) => ({
                room_id: m.roomId,
                start_at: m.start,
                end_at: m.end,
                guest: src.guest,
                comment: 'Категория продана целиком (reservationsteps iCal)',
                external_uid: `${src.tag}:${m.roomId}:${m.start}-${m.end}`,
                external_feed_url: `https://public-api.reservationsteps.ru/v1/api/ical/${m.icalId}`,
            })),
            p_source_complete: sourceComplete,
            p_confirm_empty: confirmedEmpty,
            p_min_retained_ratio: minIcalRetainedRatio,
            p_confirm_large_decrease: confirmLargeIcalDecrease,
        });
        if (rpcError) throw new Error(rpcError.message);
        if (data?.status === 'error' && typeof data?.error === 'string') {
            throw new Error(data.error);
        }
        if (
            !['ok', 'partial'].includes(data?.status) ||
            typeof data?.inserted !== 'number' ||
            typeof data?.skipped_manual !== 'number'
        ) {
            throw new Error('Некорректный ответ sync_external_occupancy');
        }
        inserted = data.inserted;
        skipped += data.skipped_manual;
    } else {
        if (safetyError) {
            const { error: logError } = await supabase.from('sync_runs').insert({
                source: src.tag,
                hotel_id: hotelId,
                finished_at: new Date().toISOString(),
                status: 'error',
                counts: {
                    existing: existingSourceCount,
                    proposed: markers.length,
                    retained_ratio:
                        existingSourceCount > 0 ? markers.length / existingSourceCount : null,
                    min_retained_ratio: minIcalRetainedRatio,
                    source_complete: sourceComplete,
                    confirmed_empty: confirmedEmpty,
                    confirmed_large_decrease: confirmLargeIcalDecrease,
                    legacy_path: true,
                },
                error: safetyError,
            });
            if (logError) {
                throw new Error(`${safetyError}. Не удалось записать ошибку в sync_runs`);
            }
            throw new Error(safetyError);
        }
        const { error: delErr } = await supabase
            .from('reserves')
            .delete()
            .eq('external_source', src.tag)
            .in('room_id', allRoomIds);
        if (delErr) throw new Error(delErr.message);

        const syncedAt = new Date().toISOString();
        for (const m of markers) {
            const { error: insErr } = await supabase.from('reserves').insert({
                room_id: m.roomId,
                start: m.start,
                end: m.end,
                guest: src.guest,
                phone: '',
                price: 0,
                quantity: 1,
                comment: 'Категория продана целиком (reservationsteps iCal)',
                created_by: src.tag,
                edited_at: syncedAt,
                edited_by: src.tag,
                external_source: src.tag,
                external_uid: `${src.tag}:${m.roomId}:${m.start}-${m.end}`,
                external_feed_url: `https://public-api.reservationsteps.ru/v1/api/ical/${m.icalId}`,
                external_synced_at: syncedAt,
            });
            if (!insErr) inserted += 1;
            else if (insErr.code === '23P01' || (insErr.message || '').includes('Наложение')) skipped += 1;
            else throw new Error(insErr.message);
        }
    }
    return { hotel: src.hotel, markers: markers.length, inserted, skipped };
};

const main = async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY обязательны');
    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const summary = [];
    for (const src of AUTO_SOURCES) {
      try {
        const roomIds = src.categories.flatMap((c) => c.roomIds);
        const occupancyResult = await readOccupancy(src.token, src.categories);
        const occ = occupancyResult.occupancy;

        const { data: rows, error } = await supabase
            .from('reserves')
            .select('room_id, start, end, external_source')
            .in('room_id', roomIds);
        if (error) throw new Error(error.message);

        const ourByRoom = new Map(roomIds.map((r) => [r, new Set()]));
        for (const z of rows ?? []) {
            if (z.external_source === MIRROR_SOURCE_TAG) continue;
            for (let n = nightOf(z.start); n < nightOf(z.end); n += 1) ourByRoom.get(z.room_id)?.add(n);
        }

        const markers = computeMarkers(src.categories, ourByRoom, occ);

        const { data, error: rpcError } = await supabase.rpc('sync_external_occupancy', {
            p_source: MIRROR_SOURCE_TAG,
            p_room_ids: roomIds,
            p_marks: markers.map((m) => ({
                room_id: m.roomId,
                start_at: m.start,
                end_at: m.end,
                guest: 'Занято (внешний календарь)',
                comment: 'Занятость из чужого календаря (зеркало, авто)',
                external_uid: `${MIRROR_SOURCE_TAG}:${m.roomId}:${m.start}-${m.end}`,
                external_feed_url: src.widgetUrl,
            })),
            p_source_complete: occupancyResult.sourceComplete,
            p_confirm_empty: occupancyResult.confirmedEmpty,
            p_min_retained_ratio: minIcalRetainedRatio,
            p_confirm_large_decrease: confirmLargeIcalDecrease,
        });
        if (rpcError) throw new Error(rpcError.message);
        if (data?.status === 'error' && typeof data?.error === 'string') {
            throw new Error(data.error);
        }
        if (
            !['ok', 'partial'].includes(data?.status) ||
            typeof data?.inserted !== 'number' ||
            typeof data?.skipped_manual !== 'number'
        ) {
            throw new Error('Некорректный ответ sync_external_occupancy');
        }

        summary.push({
            hotel: src.hotel,
            markers: markers.length,
            inserted: data.inserted,
            skipped: data.skipped_manual,
            sourceComplete: occupancyResult.sourceComplete,
            failedProbes: occupancyResult.failedProbes,
        });
      } catch (err) {
        summary.push({ hotel: src.hotel, error: err instanceof Error ? err.message : String(err) });
      }
    }

    for (const src of ICAL_SOURCES) {
        try {
            summary.push(await syncIcalSource(supabase, src));
        } catch (err) {
            summary.push({ hotel: src.hotel, error: err instanceof Error ? err.message : String(err) });
        }
    }

    console.log(JSON.stringify({ status: 'ok', summary }, null, 2));
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
