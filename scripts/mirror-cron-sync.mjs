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
    const out = new Map();
    for (const item of json?.data?.[0] ?? []) out.set(item.id, item.availableRooms ?? 0);
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

    const freeByCat = new Map();
    const maxNightByCat = new Map();
    for (const c of categories) {
        freeByCat.set(c.categoryId, new Set());
        maxNightByCat.set(c.categoryId, -1);
    }
    const freeNights = new Set();
    for (const rec of json?.data ?? []) {
        const set = freeByCat.get(rec.roomCategoryID);
        if (!set) continue;
        const night = nightOf(checkinUnix(new Date(`${rec.date}T00:00:00Z`)));
        set.add(night);
        freeNights.add(night);
        if (night > maxNightByCat.get(rec.roomCategoryID)) {
            maxNightByCat.set(rec.roomCategoryID, night);
        }
    }

    // Число свободных номеров на свободные дни (батчами; сбой дня = «полностью
    // свободно», т.е. недоучёт, а не падение всего крона).
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
                    return { night, avail: await fetchAvailableRooms(token, isoDate(day), isoDate(next)) };
                } catch {
                    return { night, avail: new Map() };
                }
            }),
        );
        for (const { night, avail } of results) availByNight.set(night, avail);
    }

    const todayNight = nightOf(checkinUnix(today));
    const occ = new Map();
    for (const c of categories) {
        const total = c.roomIds.length;
        const free = freeByCat.get(c.categoryId);
        const maxNight = maxNightByCat.get(c.categoryId);
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
    return occ;
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

const main = async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY обязательны');
    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const summary = [];
    for (const src of AUTO_SOURCES) {
      try {
        const roomIds = src.categories.flatMap((c) => c.roomIds);
        const occ = await readOccupancy(src.token, src.categories);

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

        const { error: delErr } = await supabase
            .from('reserves')
            .delete()
            .eq('external_source', MIRROR_SOURCE_TAG)
            .in('room_id', roomIds);
        if (delErr) throw new Error(delErr.message);

        const syncedAt = new Date().toISOString();
        let inserted = 0;
        let skipped = 0;
        for (const m of markers) {
            const { error: insErr } = await supabase.from('reserves').insert({
                room_id: m.roomId,
                start: m.start,
                end: m.end,
                guest: 'Занято (внешний календарь)',
                phone: '',
                price: 0,
                quantity: 1,
                comment: 'Занятость из чужого календаря (зеркало, авто)',
                created_by: MIRROR_SOURCE_TAG,
                edited_at: syncedAt,
                edited_by: MIRROR_SOURCE_TAG,
                external_source: MIRROR_SOURCE_TAG,
                external_uid: `${MIRROR_SOURCE_TAG}:${m.roomId}:${m.start}-${m.end}`,
                external_feed_url: src.widgetUrl,
                external_synced_at: syncedAt,
            });
            if (!insErr) inserted += 1;
            else if (insErr.code === '23P01' || (insErr.message || '').includes('Наложение')) skipped += 1;
            else throw new Error(insErr.message);
        }

        summary.push({ hotel: src.hotel, markers: markers.length, inserted, skipped });
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
