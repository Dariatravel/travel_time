// Название объекта всегда пишется по-русски.
//
// Зачем: менеджер ищет объект по названию — и в программе, и запросом боту.
// Латинское название («Alexandra», «Vas») он не наберёт и решит, что объекта
// нет. В подборке гостю такое название тоже показывать нечего.
//
// Без HOTEL_TITLE скрипт просто перечисляет объекты, у которых в названии нет
// ни одной русской буквы, и показывает по каждому опись — сколько номеров и
// броней, чтобы было видно, живой это объект или заготовка.
//
// Переименование: сухой прогон по умолчанию, контрольная фраза RENAME_HOTEL
// для записи. Новое название обязано содержать русские буквы. Старое название
// проверяется в самом UPDATE — если его успели поменять, запись не пройдёт.

import { createClient } from '@supabase/supabase-js';

import { normalizeHotelTitle } from './lib/chessmateStatus.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const CONFIRMATION = 'RENAME_HOTEL';
const CHUNK = 100;
const CYRILLIC = /[а-яё]/i;

const title = (process.env.HOTEL_TITLE ?? '').trim();
const newTitle = (process.env.NEW_TITLE ?? '').trim();
const cardUrl = (process.env.CARD_URL ?? '').trim();
const apply = process.env.APPLY === 'true';
const confirmation = process.env.CONFIRMATION ?? '';

const supabase = createClient(url, key, { auth: { persistSession: false } });

const chunked = (values) => {
    const chunks = [];
    for (let i = 0; i < values.length; i += CHUNK) chunks.push(values.slice(i, i + CHUNK));
    return chunks;
};

const countRoomsAndReserves = async (hotelId) => {
    const { data: rooms, error } = await supabase.from('rooms').select('id').eq('hotel_id', hotelId);
    if (error) throw new Error(`rooms: ${error.message}`);

    const roomIds = (rooms ?? []).map((room) => room.id);
    let reserves = 0;

    for (const chunk of chunked(roomIds)) {
        const { count, error: reservesError } = await supabase
            .from('reserves')
            .select('id', { count: 'exact', head: true })
            .in('room_id', chunk);
        if (reservesError) throw new Error(`reserves: ${reservesError.message}`);
        reserves += count ?? 0;
    }

    return { rooms: roomIds.length, reserves };
};

/** Показать, что за объект по ссылке: так название берётся с карточки, а не из головы. */
const showCard = async (link) => {
    console.log('');
    console.log(`Карточка: ${link}`);

    try {
        const response = await fetch(link, { signal: AbortSignal.timeout(20_000) });
        const body = await response.text();
        const pick = (pattern) => body.match(pattern)?.[1]?.trim();

        const cardTitle =
            pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
            pick(/<title>([^<]+)<\/title>/i);
        const description = pick(
            /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
        );

        console.log(`  HTTP ${response.status}`);
        if (cardTitle) console.log(`  Заголовок: ${cardTitle}`);
        if (description) console.log(`  Описание: ${description.slice(0, 500)}`);
        if (!cardTitle && !description) console.log('  Заголовок со страницы прочитать не удалось.');
    } catch (error) {
        console.log(`  Открыть не удалось: ${error instanceof Error ? error.message : error}`);
    }
};

const listLatinTitled = async (hotels) => {
    const latin = (hotels ?? []).filter((hotel) => !CYRILLIC.test(hotel.title ?? ''));

    console.log(`Объектов с нерусским названием: ${latin.length}`);

    for (const hotel of latin) {
        const counts = await countRoomsAndReserves(hotel.id);
        console.log('');
        console.log(`  «${(hotel.title ?? '').trim()}»`);
        console.log(`    город: ${(hotel.city ?? '').trim() || '(пусто)'}`);
        console.log(`    ссылка: ${(hotel.telegram_url ?? '').trim() || '(пусто)'}`);
        console.log(`    номеров: ${counts.rooms}, броней: ${counts.reserves}`);
    }
};

const main = async () => {
    const { data: hotels, error } = await supabase
        .from('hotels')
        .select('id, title, city, telegram_url')
        .order('title');
    if (error) throw new Error(`hotels: ${error.message}`);

    if (cardUrl) await showCard(cardUrl);

    if (!title) {
        console.log('');
        await listLatinTitled(hotels);
        console.log('');
        console.log('HOTEL_TITLE не задан — только показал список, ничего не менял.');

        return;
    }

    const normalized = normalizeHotelTitle(title);
    const matches = (hotels ?? []).filter(
        (hotel) => normalizeHotelTitle(hotel.title) === normalized,
    );

    if (!matches.length) throw new Error(`Объект «${title}» не найден`);
    if (matches.length > 1) {
        throw new Error(`Под «${title}» подходит ${matches.length} объектов — уточните название`);
    }

    if (!newTitle) throw new Error('NEW_TITLE не задан');
    if (!CYRILLIC.test(newTitle)) {
        throw new Error(`Новое название «${newTitle}» без русских букв — название должно быть русским`);
    }

    const hotel = matches[0];
    const current = (hotel.title ?? '').trim();
    const counts = await countRoomsAndReserves(hotel.id);

    console.log('');
    console.log(`Объект: «${current}»`);
    console.log(`  город: ${(hotel.city ?? '').trim() || '(пусто)'}`);
    console.log(`  ссылка: ${(hotel.telegram_url ?? '').trim() || '(пусто)'}`);
    console.log(`  номеров: ${counts.rooms}, броней: ${counts.reserves}`);
    console.log(`  название станет: «${newTitle}»`);

    if (current === newTitle) {
        console.log('');
        console.log('Название уже такое — менять нечего.');

        return;
    }

    if (!apply) {
        console.log('');
        console.log('Сухой прогон: ничего не изменено.');
        console.log(`Запустите с apply = true и контрольной фразой ${CONFIRMATION}.`);

        return;
    }

    if (confirmation !== CONFIRMATION) {
        throw new Error(`Неверная контрольная фраза. Нужна ${CONFIRMATION}`);
    }

    const { error: updateError } = await supabase
        .from('hotels')
        .update({ title: newTitle })
        .eq('id', hotel.id)
        .eq('title', hotel.title);
    if (updateError) throw new Error(`update: ${updateError.message}`);

    const { data: after, error: afterError } = await supabase
        .from('hotels')
        .select('title')
        .eq('id', hotel.id)
        .maybeSingle();
    if (afterError) throw new Error(`check: ${afterError.message}`);

    console.log('');
    console.log(`Готово: теперь «${(after?.title ?? '').trim()}»`);

    if ((after?.title ?? '').trim() !== newTitle) {
        throw new Error('В базе осталось старое название — проверьте вручную.');
    }
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
