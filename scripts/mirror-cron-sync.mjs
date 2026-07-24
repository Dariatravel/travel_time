#!/usr/bin/env node
// Автосинхронизация занятости для ЗЕЛЁНЫХ зеркальных отелей (Shelter/FrontDesk24).
// Пока — «Студио Сан Амра» (1 номер). Логика та же, что у голубых по кнопке,
// но без перестановки броней (для 1 номера её нет): наши брони не трогаем,
// внешнюю занятость по дням дописываем метками external_source='mirror_shelter'.

import { createClient } from '@supabase/supabase-js';

const NIGHT = 86400;
const MIRROR_SOURCE_TAG = 'mirror_shelter';
const FD_AVAILABLE_DATES = 'https://pms.frontdesk24.ru/api/online/getAvailableDates';
const HORIZON_DAYS = 365;

// Авто-источники (помечены как зелёные-автосинк). Токены — публичные (виджет).
const AUTO_SOURCES = [
    {
        hotel: 'Студио Сан Амра',
        token: 'C16A5147-C3A7-47F6-8C2E-C4627A0B4DA1',
        widgetUrl: 'https://sun-amra.ru/book/',
        categories: [{ categoryId: 57715, roomIds: ['f328f032-b384-44f5-a522-b3bb2fee0be0'] }],
    },
];

const isoDate = (d) => d.toISOString().slice(0, 10);
// Заезд 14:00 МСК = 11:00 UTC, выезд 12:00 МСК = 09:00 UTC.
const checkinUnix = (d) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 11) / 1000);
const checkoutUnix = (d) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9) / 1000);
const nightOf = (unix) => Math.floor(unix / NIGHT);
const dateOfNight = (night) => new Date(night * NIGHT * 1000);

// getAvailableDates отдаёт СВОБОДНЫЕ даты по категориям (одним запросом).
// Занято = дата в пределах календаря отеля, но НЕ свободна. Так мы НЕ теряем
// полностью занятые дни (их getVariants вообще не перечисляет) и не помечаем
// занятым «далёкое будущее без данных» (ограничиваем горизонт последней датой,
// по которой у отеля вообще есть календарь).
// Внимание: getAvailableDates даёт «свободно/нет», а не число свободных, поэтому
// корректно только для категорий с ОДНИМ номером (наш авто-случай).
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
    for (const rec of json?.data ?? []) {
        const set = freeByCat.get(rec.roomCategoryID);
        if (!set) continue;
        const night = nightOf(checkinUnix(new Date(`${rec.date}T00:00:00Z`)));
        set.add(night);
        if (night > maxNightByCat.get(rec.roomCategoryID)) {
            maxNightByCat.set(rec.roomCategoryID, night);
        }
    }

    const todayNight = nightOf(checkinUnix(today));
    const occ = new Map();
    for (const c of categories) {
        const total = c.roomIds.length; // авто-случай: 1
        const free = freeByCat.get(c.categoryId);
        const maxNight = maxNightByCat.get(c.categoryId);
        const byNight = new Map();
        for (let night = todayNight; night <= maxNight; night += 1) {
            byNight.set(night, free.has(night) ? 0 : total);
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
    }

    console.log(JSON.stringify({ status: 'ok', summary }, null, 2));
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
