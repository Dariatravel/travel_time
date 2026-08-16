// Удалить пустую запись объекта из программы.
//
// Зачем: в списке объектов накапливаются задвоенные и пробные записи — у них
// нет ни номеров, ни броней, ни карточки на сайте. Они мешают: всплывают в
// поиске по названию, попадают в отчёты качества данных и заставляют каждый
// раз вспоминать, что это за «Vas».
//
// Удаление необратимо, поэтому здесь четыре предохранителя:
//   • сухой прогон по умолчанию — сначала показываем опись;
//   • запись только при APPLY=true и контрольной фразе DELETE_HOTELS;
//   • название должно совпасть ровно с одним объектом;
//   • при наличии ХОТЯ БЫ ОДНОЙ брони объект не удаляется вообще. Бронь — это
//     живой гость, восстановить её будет неоткуда.
//
// Строки занятости «Бельведера» (external_source = 'manual_belvedere') этот
// скрипт не трогает: он работает только с объектами, у которых броней нет.

import { createClient } from '@supabase/supabase-js';

import { normalizeHotelTitle } from './lib/chessmateStatus.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const CONFIRMATION = 'DELETE_HOTELS';
const CHUNK = 100;

const titles = (process.env.HOTEL_TITLES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
const apply = process.env.APPLY === 'true';
const confirmation = process.env.CONFIRMATION ?? '';

const supabase = createClient(url, key, { auth: { persistSession: false } });

const chunked = (values) => {
    const chunks = [];
    for (let i = 0; i < values.length; i += CHUNK) chunks.push(values.slice(i, i + CHUNK));
    return chunks;
};

/** Собираем опись: что именно исчезнет вместе с записью. */
const collectInventory = async (hotel) => {
    const { data: rooms, error: roomsError } = await supabase
        .from('rooms')
        .select('id, title')
        .eq('hotel_id', hotel.id);
    if (roomsError) throw new Error(`rooms: ${roomsError.message}`);

    const roomIds = (rooms ?? []).map((room) => room.id);
    const reserves = [];
    const closures = [];

    for (const chunk of chunked(roomIds)) {
        const { data: chunkReserves, error: reservesError } = await supabase
            .from('reserves')
            .select('id, room_id, start, end, guest, external_source')
            .in('room_id', chunk);
        if (reservesError) throw new Error(`reserves: ${reservesError.message}`);
        reserves.push(...(chunkReserves ?? []));

        const { data: chunkClosures, error: closuresError } = await supabase
            .from('room_closures')
            .select('id, room_id')
            .in('room_id', chunk);
        if (closuresError) throw new Error(`room_closures: ${closuresError.message}`);
        closures.push(...(chunkClosures ?? []));
    }

    const { data: messages, error: messagesError } = await supabase
        .from('telegram_chat_messages')
        .select('id')
        .eq('hotel_id', hotel.id);
    if (messagesError) throw new Error(`telegram_chat_messages: ${messagesError.message}`);

    return { rooms: rooms ?? [], roomIds, reserves, closures, messages: messages ?? [] };
};

const printInventory = (hotel, inventory) => {
    console.log('');
    console.log(`Объект: «${(hotel.title ?? '').trim()}»`);
    console.log(`  id: ${hotel.id}`);
    console.log(`  город: ${(hotel.city ?? '').trim() || '(пусто)'}`);
    console.log(`  ссылка: ${(hotel.telegram_url ?? '').trim() || '(пусто)'}`);
    console.log(`  виден в поиске: ${hotel.is_search_visible === false ? 'нет' : 'да'}`);
    console.log(`  номеров: ${inventory.rooms.length}`);
    console.log(`  броней: ${inventory.reserves.length}`);
    console.log(`  закрытий номеров: ${inventory.closures.length}`);
    console.log(`  сообщений отельеров: ${inventory.messages.length}`);

    for (const reserve of inventory.reserves.slice(0, 10)) {
        console.log(`    бронь ${reserve.start}–${reserve.end} ${reserve.guest ?? ''}`.trimEnd());
    }
};

/** Дети удаляются явно: так результат не зависит от того, настроен ли каскад. */
const deleteHotelWithChildren = async (hotel, inventory) => {
    for (const chunk of chunked(inventory.roomIds)) {
        const { error } = await supabase.from('room_closures').delete().in('room_id', chunk);
        if (error) throw new Error(`room_closures delete: ${error.message}`);
    }

    if (inventory.roomIds.length) {
        const { error } = await supabase.from('rooms').delete().eq('hotel_id', hotel.id);
        if (error) throw new Error(`rooms delete: ${error.message}`);
    }

    const { error: hotelError } = await supabase.from('hotels').delete().eq('id', hotel.id);
    if (hotelError) throw new Error(`hotels delete: ${hotelError.message}`);

    const { data: after, error: afterError } = await supabase
        .from('hotels')
        .select('id')
        .eq('id', hotel.id)
        .maybeSingle();
    if (afterError) throw new Error(`check: ${afterError.message}`);

    return !after;
};

const main = async () => {
    if (!titles.length) throw new Error('HOTEL_TITLES не задан');

    const { data: hotels, error } = await supabase
        .from('hotels')
        .select('id, title, city, telegram_url, is_search_visible');
    if (error) throw new Error(`hotels: ${error.message}`);

    const targets = [];

    for (const title of titles) {
        const normalized = normalizeHotelTitle(title);
        const matches = (hotels ?? []).filter(
            (hotel) => normalizeHotelTitle(hotel.title) === normalized,
        );

        if (!matches.length) throw new Error(`Объект «${title}» не найден`);
        if (matches.length > 1) {
            throw new Error(`Под «${title}» подходит ${matches.length} объектов — уточните название`);
        }

        const hotel = matches[0];
        const inventory = await collectInventory(hotel);
        printInventory(hotel, inventory);

        if (inventory.reserves.length) {
            console.log('  ⛔ ЕСТЬ БРОНИ — этот объект удалён не будет.');
            throw new Error(
                `«${(hotel.title ?? '').trim()}»: ${inventory.reserves.length} броней. ` +
                    'Удаление отменено целиком, ничего не тронуто.',
            );
        }

        targets.push({ hotel, inventory });
    }

    console.log('');
    console.log(`К удалению готово объектов: ${targets.length}`);

    if (!apply) {
        console.log('Сухой прогон: ничего не удалено.');
        console.log(`Запустите с apply = true и контрольной фразой ${CONFIRMATION}.`);

        return;
    }

    if (confirmation !== CONFIRMATION) {
        throw new Error(`Неверная контрольная фраза. Нужна ${CONFIRMATION}`);
    }

    for (const { hotel, inventory } of targets) {
        const gone = await deleteHotelWithChildren(hotel, inventory);
        console.log(`${gone ? 'Удалено' : 'НЕ УДАЛЕНО'}: «${(hotel.title ?? '').trim()}»`);
        if (!gone) throw new Error('Запись осталась в базе — остановился, дальше не иду.');
    }

    const { data: rest, error: restError } = await supabase.from('hotels').select('id');
    if (restError) throw new Error(`hotels: ${restError.message}`);
    console.log('');
    console.log(`Объектов в программе осталось: ${(rest ?? []).length}`);
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
