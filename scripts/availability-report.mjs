// Отчёт «окошки»: свободные даты по каждому номеру каждого отеля за период.
// Запускается workflow-ом availability-report.yml (workflow_dispatch) — там
// есть доступ к SUPABASE_SERVICE_ROLE_KEY. Скрипт только собирает данные и
// печатает JSON между маркерами; фильтрация по цветам шахматки и группировка
// по категориям делается потребителем отчёта.
//
// Ночь = сутки проживания: бронь занимает ночи [день заезда .. день выезда-1],
// как в остальном коде (toReserveDayIndex). Период задаётся датами заезда и
// выезда: PERIOD_START=2026-08-05 PERIOD_END=2026-08-20 → ночи 05.08–19.08.

import { createClient } from '@supabase/supabase-js';

const NIGHT = 86400;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const periodStart = process.env.PERIOD_START ?? '2026-08-05';
const periodEnd = process.env.PERIOD_END ?? '2026-08-20';

const dayIndexOfDate = (iso) => Math.floor(Date.UTC(...iso.split('-').map(Number).map((v, i) => (i === 1 ? v - 1 : v))) / 1000 / NIGHT);
const dateOfDayIndex = (day) => new Date(day * NIGHT * 1000).toISOString().slice(0, 10);
const dayIndexOfUnix = (unix) => Math.floor(unix / NIGHT);

const firstNight = dayIndexOfDate(periodStart);
const lastNight = dayIndexOfDate(periodEnd) - 1; // ночь перед выездом
const periodStartUnix = firstNight * NIGHT;
const periodEndUnix = (lastNight + 1) * NIGHT + NIGHT; // с запасом

const supabase = createClient(url, key, { auth: { persistSession: false } });

const fetchAll = async (table, columns, applyFilters) => {
    const pageSize = 1000;
    const rows = [];
    for (let from = 0; ; from += pageSize) {
        let query = supabase.from(table).select(columns).range(from, from + pageSize - 1);
        if (applyFilters) query = applyFilters(query);
        const { data, error } = await query;
        if (error) throw new Error(`${table}: ${error.message}`);
        rows.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
    }
    return rows;
};

const main = async () => {
    const [hotels, rooms, reserves, closures] = await Promise.all([
        fetchAll('hotels', 'id, title, city, address, telegram_url'),
        fetchAll('rooms', 'id, hotel_id, title, "order"'),
        fetchAll('reserves', 'room_id, start, end', (q) =>
            q.lt('start', periodEndUnix).gt('end', periodStartUnix),
        ),
        fetchAll('room_closures', 'room_id, start, end', (q) =>
            q.lt('start', periodEndUnix).gt('end', periodStartUnix),
        ).catch(() => []),
    ]);

    const busyNightsByRoom = new Map();
    const markBusy = (roomId, startUnix, endUnix) => {
        const from = Math.max(dayIndexOfUnix(startUnix), firstNight);
        const to = Math.min(dayIndexOfUnix(endUnix) - 1, lastNight);
        if (to < from) return;
        let set = busyNightsByRoom.get(roomId);
        if (!set) busyNightsByRoom.set(roomId, (set = new Set()));
        for (let night = from; night <= to; night += 1) set.add(night);
    };
    for (const r of reserves) markBusy(r.room_id, Number(r.start), Number(r.end));
    for (const c of closures) markBusy(c.room_id, Number(c.start), Number(c.end));

    const hotelById = new Map(hotels.map((h) => [h.id, h]));
    const report = new Map(); // hotel_id -> { hotel_title, rooms: [] }

    for (const room of rooms) {
        const hotel = hotelById.get(room.hotel_id);
        if (!hotel) continue;

        const busy = busyNightsByRoom.get(room.id) ?? new Set();
        const freeRanges = [];
        let rangeStart = null;
        for (let night = firstNight; night <= lastNight + 1; night += 1) {
            const isFree = night <= lastNight && !busy.has(night);
            if (isFree && rangeStart === null) rangeStart = night;
            if (!isFree && rangeStart !== null) {
                // свободные ночи rangeStart..night-1 → заезд rangeStart, выезд night
                freeRanges.push([dateOfDayIndex(rangeStart), dateOfDayIndex(night)]);
                rangeStart = null;
            }
        }

        let entry = report.get(room.hotel_id);
        if (!entry) {
            report.set(room.hotel_id, (entry = { hotel_id: room.hotel_id, hotel_title: hotel.title, city: hotel.city ?? null, address: hotel.address ?? null, telegram_url: hotel.telegram_url ?? null, rooms: [] }));
        }
        entry.rooms.push({
            room_title: room.title,
            order: room.order ?? 999,
            free_ranges: freeRanges,
            free_nights: lastNight - firstNight + 1 - busy.size,
        });
    }

    for (const entry of report.values()) {
        entry.rooms.sort((a, b) => a.order - b.order);

        // Ни одной брони и ни одной закрытой даты за весь период. Это не то же
        // самое, что «всё свободно»: так же выглядит шахматка, которую перестали
        // вести. Потребитель отчёта помечает такие объекты «уточнить у отельера»,
        // а не выдаёт их как гарантированно свободные.
        entry.no_occupancy_in_period = entry.rooms
            .filter((room) => !/буфер/i.test(room.room_title ?? ''))
            .every((room) => room.free_nights === lastNight - firstNight + 1);
    }

    // Сообщения отельеров за последние дни: в подборку идут не только окошки из
    // шахматки, но и то, что отельеры написали словами («с 19 по 22 Мачара»).
    // CHAT_DAYS=0 — не забирать вовсе.
    const chatDays = Number(process.env.CHAT_DAYS ?? 2);
    let chatMessages = [];

    if (chatDays > 0) {
        const since = new Date(Date.now() - chatDays * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
            .from('telegram_chat_messages')
            .select('chat_title, author_name, author_username, text, sent_at, edited_at')
            .gte('sent_at', since)
            .order('sent_at', { ascending: true });

        // Отсутствие сообщений не повод ронять отчёт по занятости.
        if (error) console.error(`telegram_chat_messages: ${error.message}`);
        else chatMessages = data ?? [];
    }

    const payload = {
        period: { start: periodStart, end: periodEnd, nights: lastNight - firstNight + 1 },
        hotels: Array.from(report.values()),
        chat: { days: chatDays, messages: chatMessages },
    };

    console.log('===AVAILABILITY_REPORT_START===');
    console.log(JSON.stringify(payload));
    console.log('===AVAILABILITY_REPORT_END===');
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
