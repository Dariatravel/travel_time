#!/usr/bin/env node
// Крон занятости для отелей на Bnovo (online.bnovo.ru), у которых публичный
// iCal слишком грубый (одна категория = много номеров). Логинимся как живой
// человек через headless-браузер (Playwright) — CSRF и куки решаются сами, —
// затем читаем занятость ПО КОНКРЕТНЫМ НОМЕРАМ штатным запросом кабинета
// (POST /planning/bookings, FormData dfrom/dto/daily=0) и переносим к нам.
//
// Логин/пароль отельера берём из секретов окружения (в коде их нет).
// Снятую занятость помечаем external_source='bnovo_<slug>' — откат одним DELETE,
// а пересечения с ручными бронями шахматки пропускаем (триггер А1 отдаёт 23P01).
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const MOSCOW_UTC_OFFSET_HOURS = 3;
const CHECK_IN_HOUR_MSK = 14;
const CHECK_OUT_HOUR_MSK = 12;
const HORIZON_DAYS = 400;
const NIGHT = 86_400;

// Отели на Bnovo. roomMap: bnovo room_id (из /roomTypes/get) → наш room_id.
const BNOVO_HOTELS = [
    {
        title: 'Джаннат',
        loginEnv: 'BNOVO_DJANNAT_LOGIN',
        passwordEnv: 'BNOVO_DJANNAT_PASSWORD',
        externalSource: 'bnovo_djannat',
        guest: 'Занято (Джаннат)',
        // Апартаменты 1-8 + Комфорт класса 9-12 = наши «N апартаменты 1к 3 этаж»;
        // Коттеджный дом 1-2 = «N номер в домике»;
        // Семейный 2 → «2 этаж», Семейный 1 → «3 этаж» (взаимно-однозначно).
        roomMap: {
            1261492: '03daaed6-bf71-4121-9027-93a887348e41', // Апарт 1
            1261780: 'd5db56cc-ae04-4d57-85ac-485ca8c61cee', // Апарт 2
            1261781: '03612cc7-4585-44b2-bb1c-e729ffd77e8f', // Апарт 3
            1261782: '34393707-e869-48ce-8ed9-93ce78e11dd4', // Апарт 4
            1261783: '621cb337-3a87-427d-9c23-3bc58ccef0d8', // Апарт 5
            1261784: '038f1fcb-44c2-4931-b398-3871162779e7', // Апарт 6
            1261785: 'e6f29a88-bbf1-455a-8051-eba0a3fc7f47', // Апарт 7
            1261786: 'f41c0ad1-6fdb-411c-aad9-73bdbe859619', // Апарт 8
            1261496: 'f07d227e-29a0-42cc-a8f6-2a6851401d05', // Комфорт 9
            1261495: 'c733b00c-ed74-42be-9d3e-539a599acae8', // Комфорт 10
            1261494: '25b6eb7b-bbac-4a12-a52b-0b5132fbd9ec', // Комфорт 11
            1261493: 'fddf2167-52c5-4535-8cca-93587c768fe3', // Комфорт 12
            1261777: 'dd01bf9e-08ca-4a0f-a8e4-73e92e38bbcf', // Семейный 1 → 3 этаж
            1261497: 'c9ef1221-3b44-40b5-8c44-0d80e3fb83b4', // Семейный 2 → 2 этаж
            1261499: '317496fb-6a6f-430f-902e-7f7db1d5f051', // Коттедж 1
            1261498: '9d720e72-2086-4130-a7fc-121d8f1241a2', // Коттедж 2
        },
    },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isOverlapConflict = (error) =>
    error?.code === '23P01' || String(error?.message ?? '').includes('Наложение броней запрещено');

const utcMidnightToday = () => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

const dateToUnix = (isoDate, hourMsk) => {
    const [y, m, d] = isoDate.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d, hourMsk - MOSCOW_UTC_OFFSET_HOURS) / 1000);
};

// Логинимся в кабинет и читаем брони штатным запросом шахматки по всему
// горизонту (запросы бьём окнами ~1.5 месяца, как это делает сам интерфейс).
const fetchBnovoBookings = async (login, password) => {
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.goto('https://online.bnovo.ru/', { waitUntil: 'networkidle', timeout: 60_000 });

        await page.getByPlaceholder(/электронную почту/i).fill(login);
        await page.getByPlaceholder(/пароль/i).fill(password);
        await page.getByRole('button', { name: /Войти/ }).click();

        // Успешный вход убирает форму «Вход в систему» и поднимает SPA-кабинет.
        await page.waitForFunction(() => !/Вход в систему/.test(document.body.innerText), null, {
            timeout: 60_000,
        });
        await page.waitForFunction(() => Boolean(document.querySelector('.v-application')), null, {
            timeout: 60_000,
        });

        const periods = [];
        const start = new Date(utcMidnightToday());
        for (let i = 0; i < 10; i += 1) {
            const from = new Date(start);
            from.setUTCDate(from.getUTCDate() + i * 45 - 5);
            const to = new Date(from);
            to.setUTCDate(to.getUTCDate() + 55);
            periods.push([from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)]);
            if (from.getTime() - start.getTime() > HORIZON_DAYS * 86_400_000) break;
        }

        const bookings = await page.evaluate(async (windows) => {
            const seen = new Map();
            for (const [dfrom, dto] of windows) {
                const fd = new FormData();
                fd.append('dfrom', dfrom);
                fd.append('dto', dto);
                fd.append('daily', '0');
                const response = await fetch('/planning/bookings', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        Accept: 'application/json, text/plain, */*',
                    },
                    body: fd,
                });
                if (!response.ok) continue;
                const json = await response.json();
                for (const b of json.result || []) {
                    if (!b.room_id) continue;
                    // Отменённые/незаезд не занимают номер (Bnovo: 5/6).
                    if (b.status_id === 5 || b.status_id === 6) continue;
                    const from = (b.real_arrival || b.start_date || '').slice(0, 10);
                    const to = (b.real_departure || b.final_date || '').slice(0, 10);
                    if (from && to) seen.set(String(b.booking_id), [Number(b.room_id), from, to]);
                }
                await new Promise((r) => setTimeout(r, 400));
            }
            return [...seen.values()];
        }, periods);

        return bookings;
    } finally {
        await browser.close();
    }
};

const syncHotel = async (supabase, hotel) => {
    const login = process.env[hotel.loginEnv];
    const password = process.env[hotel.passwordEnv];
    if (!login || !password) {
        throw new Error(`Нет учётных данных ${hotel.loginEnv}/${hotel.passwordEnv}`);
    }

    const bookings = await fetchBnovoBookings(login, password);
    const roomIds = [...new Set(Object.values(hotel.roomMap))];
    const todayUnix = Math.floor(utcMidnightToday() / 1000);

    // Ручные брони шахматки (всё, что не наша метка) — их ночи неприкосновенны.
    const { data: existing, error: selErr } = await supabase
        .from('reserves')
        .select('room_id, start, end, external_source')
        .in('room_id', roomIds);
    if (selErr) throw new Error(selErr.message);

    const manualNights = new Map(roomIds.map((id) => [id, new Set()]));
    for (const r of existing ?? []) {
        if (r.external_source === hotel.externalSource) continue;
        const set = manualNights.get(r.room_id);
        if (!set) continue;
        for (let n = Math.floor(r.start / NIGHT); n < Math.floor(r.end / NIGHT); n += 1) set.add(n);
    }

    // Свежий снимок: убираем прошлые метки этого источника и пишем текущие.
    const { error: delErr } = await supabase
        .from('reserves')
        .delete()
        .eq('external_source', hotel.externalSource)
        .in('room_id', roomIds);
    if (delErr) throw new Error(delErr.message);

    const syncedAt = new Date().toISOString();
    let inserted = 0;
    let skippedPast = 0;
    let skippedManual = 0;
    let conflicts = 0;

    for (const [bnovoRoomId, from, to] of bookings) {
        const roomId = hotel.roomMap[bnovoRoomId];
        if (!roomId) continue;
        const start = dateToUnix(from, CHECK_IN_HOUR_MSK);
        const end = dateToUnix(to, CHECK_OUT_HOUR_MSK);
        if (end <= todayUnix || end <= start) {
            skippedPast += 1;
            continue;
        }
        const clampedStart = Math.max(start, dateToUnix(new Date(todayUnix * 1000).toISOString().slice(0, 10), CHECK_IN_HOUR_MSK));
        const nights = new Set();
        for (let n = Math.floor(clampedStart / NIGHT); n < Math.floor(end / NIGHT); n += 1) nights.add(n);
        const manual = manualNights.get(roomId);
        if (manual && [...nights].some((n) => manual.has(n))) {
            skippedManual += 1;
            continue;
        }

        const { error } = await supabase.from('reserves').insert({
            room_id: roomId,
            start: clampedStart,
            end,
            guest: hotel.guest,
            phone: '',
            price: 0,
            quantity: 1,
            comment: 'Занятость из Bnovo (кабинет отельера)',
            created_by: hotel.externalSource,
            edited_at: syncedAt,
            edited_by: hotel.externalSource,
            external_source: hotel.externalSource,
            external_uid: `${hotel.externalSource}:${roomId}:${clampedStart}-${end}`,
            external_feed_url: 'https://online.bnovo.ru/',
            external_synced_at: syncedAt,
        });

        if (!error) {
            inserted += 1;
        } else if (isOverlapConflict(error)) {
            conflicts += 1;
        } else {
            throw new Error(error.message);
        }
    }

    return { title: hotel.title, bookings: bookings.length, inserted, skippedPast, skippedManual, conflicts };
};

const main = async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const results = [];
    const failures = [];
    for (const hotel of BNOVO_HOTELS) {
        try {
            results.push(await syncHotel(supabase, hotel));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Bnovo sync failed: ${hotel.title} (${message})`);
            failures.push({ title: hotel.title, message });
        }
        await sleep(500);
    }

    console.log(JSON.stringify({ status: failures.length ? 'partial' : 'ok', results, failures }, null, 2));
    if (failures.length) process.exit(1);
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
