// «Заброшенные» шахматки: зелёные и голубые объекты, у которых на ближайшие
// недели нет ни одной брони и ни одной закрытой даты.
//
// Зачем: пустая шахматка и свободный объект — не одно и то же. Если шахматку
// перестали вести, программа честно покажет «свободно всё», и объект попадёт в
// подборку как гарантированно доступный. В разгар сезона полностью пустой
// объект — повод спросить отельера, а не предлагать его гостю.
//
// Запускается workflow-ом stale-chessmate-report.yml: раз в неделю и вручную.

import { createClient } from '@supabase/supabase-js';

import { getChessmateStatus, isMaintainedStatus } from './lib/chessmateStatus.mjs';

const NIGHT = 86400;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const days = Number(process.env.AHEAD_DAYS ?? 30);
const supabase = createClient(url, key, { auth: { persistSession: false } });

const nowUnix = Math.floor(Date.now() / 1000);
const fromUnix = Math.floor(nowUnix / NIGHT) * NIGHT;
const toUnix = fromUnix + days * NIGHT;

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

const formatDate = (unix) => new Date(unix * 1000).toISOString().slice(0, 10);

const main = async () => {
    const [hotels, rooms, reserves, closures] = await Promise.all([
        fetchAll('hotels', 'id, title, city'),
        fetchAll('rooms', 'id, hotel_id, title'),
        fetchAll('reserves', 'room_id, start, end', (q) => q.lt('start', toUnix).gt('end', fromUnix)),
        fetchAll('room_closures', 'room_id, start, end', (q) =>
            q.lt('start', toUnix).gt('end', fromUnix),
        ).catch(() => []),
    ]);

    const roomsByHotel = new Map();
    for (const room of rooms) {
        // Служебная строка «Буфер для переноса» занятостью не считается.
        if (/буфер/i.test(room.title ?? '')) continue;

        const list = roomsByHotel.get(room.hotel_id) ?? [];
        list.push(room);
        roomsByHotel.set(room.hotel_id, list);
    }

    const busyRoomIds = new Set([
        ...reserves.map((row) => row.room_id),
        ...closures.map((row) => row.room_id),
    ]);

    const stale = [];
    for (const hotel of hotels) {
        const status = getChessmateStatus(hotel.title);
        if (!isMaintainedStatus(status)) continue;

        const hotelRooms = roomsByHotel.get(hotel.id) ?? [];
        if (!hotelRooms.length) continue;

        const busy = hotelRooms.filter((room) => busyRoomIds.has(room.id)).length;
        if (busy === 0) {
            stale.push({ title: (hotel.title ?? '').trim(), city: hotel.city, status, rooms: hotelRooms.length });
        }
    }

    stale.sort((left, right) => right.rooms - left.rooms || left.title.localeCompare(right.title, 'ru'));

    console.log(
        `Период проверки: ${formatDate(fromUnix)} — ${formatDate(toUnix)} (${days} дней)`,
    );
    console.log('');
    console.log(
        `Зелёных и голубых шахматок без единой брони и закрытой даты: ${stale.length}`,
    );

    if (!stale.length) {
        console.log('Все актуальные шахматки ведутся — пустых нет.');

        return;
    }

    console.log('');
    for (const item of stale) {
        const color = item.status === 'mirror' ? 'голубая' : 'зелёная';
        console.log(`  ${item.title} — ${item.rooms} ном., ${item.city ?? 'город не указан'} (${color})`);
    }

    console.log('');
    console.log('Что это значит: занятости нет вообще. Либо объект правда пустой,');
    console.log('либо шахматку перестали вести — тогда её нельзя предлагать как свободную.');
    console.log('Голубые в этом списке — повод проверить, работает ли автосинхронизация.');
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
