// Проверка здоровья данных и защит.
//
// Отвечает на вопросы, которые иначе выясняются вручную:
//   • стоит ли в базе защита от двойного бронирования;
//   • у скольких номеров не заполнена вместимость (от этого зависит, может ли
//     бот фильтровать по числу гостей);
//   • у каких объектов нет города или ссылки — они выпадают из подборок.
//
// Только чтение.

import { createClient } from '@supabase/supabase-js';

import { getChessmateStatus, isMaintainedStatus } from './lib/chessmateStatus.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const fetchAll = async (table, columns) => {
    const pageSize = 1000;
    const rows = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from(table)
            .select(columns)
            .range(from, from + pageSize - 1);
        if (error) throw new Error(`${table}: ${error.message}`);
        rows.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
    }
    return rows;
};

const checkDoubleBookingGuard = async () => {
    // Функция booking_night_range появляется вместе с защитой от двойного
    // бронирования. Нет функции — значит миграция не применена.
    const { error } = await supabase.rpc('booking_night_range', {
        start_unix: 0,
        end_unix: 86400,
    });

    if (!error) return { applied: true };

    const message = error.message ?? '';
    const missing = /could not find|does not exist|schema cache/i.test(message);

    return { applied: false, missing, message };
};

const main = async () => {
    console.log('=== ЗАЩИТА ОТ ДВОЙНОГО БРОНИРОВАНИЯ ===');
    const guard = await checkDoubleBookingGuard();
    if (guard.applied) {
        console.log('Применена: функция booking_night_range в базе есть.');
    } else if (guard.missing) {
        console.log('НЕ ПРИМЕНЕНА: функции booking_night_range в базе нет.');
        console.log('Файл готов: supabase/migrations/20260713_prevent_double_booking.sql');
    } else {
        console.log(`Проверить не удалось: ${guard.message}`);
    }

    const [hotels, rooms] = await Promise.all([
        fetchAll('hotels', 'id, title, city, telegram_url'),
        fetchAll('rooms', 'id, hotel_id, title, quantity'),
    ]);

    const maintained = new Set(
        hotels.filter((hotel) => isMaintainedStatus(getChessmateStatus(hotel.title))).map((h) => h.id),
    );

    const realRooms = rooms.filter((room) => !/буфер/i.test(room.title ?? ''));
    const noQuantity = realRooms.filter((room) => !room.quantity);
    const noQuantityMaintained = noQuantity.filter((room) => maintained.has(room.hotel_id));

    console.log('');
    console.log('=== ВМЕСТИМОСТЬ НОМЕРОВ (нужна для подбора по числу гостей) ===');
    console.log(`Всего номеров: ${realRooms.length}`);
    console.log(
        `Без вместимости: ${noQuantity.length}` +
            ` (из них в зелёных и голубых: ${noQuantityMaintained.length})`,
    );
    if (realRooms.length) {
        const filled = Math.round(((realRooms.length - noQuantity.length) / realRooms.length) * 100);
        console.log(`Заполнено: ${filled}%`);
    }

    const noCity = hotels.filter((hotel) => !(hotel.city ?? '').trim());
    const noLink = hotels.filter(
        (hotel) => !(hotel.telegram_url ?? '').trim() && maintained.has(hotel.id),
    );

    console.log('');
    console.log('=== КАРТОЧКИ ОБЪЕКТОВ ===');
    console.log(`Без города: ${noCity.length}`);
    for (const hotel of noCity) console.log(`  ${(hotel.title ?? '').trim()}`);
    console.log(`Без ссылки (зелёные и голубые): ${noLink.length}`);
    for (const hotel of noLink) console.log(`  ${(hotel.title ?? '').trim()}`);
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
