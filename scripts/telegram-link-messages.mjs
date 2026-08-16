// Привязать сообщения из чата отельеров к объектам: заполнить
// telegram_chat_messages.hotel_id.
//
// Зачем: чтобы «окошки», написанные словами, попадали в подборку рядом со своим
// отелем, а не разбирались вручную. Кто про какой объект пишет, видно из самих
// сообщений: отельеры либо называют объект в тексте («Здравствуйте Киараз
// Resort», «ГД "АССИР" шахматка актуальна»), либо подписаны им в Telegram
// («Сергей Белая дача», «Кама Ассир Zukhba»).
//
// Справочник контактов из CRM намеренно не заводим: там персональные данные
// (телефоны), а репозиторий публичный. Совпадения ищем по названиям объектов,
// остальное остаётся в отчёте — эти случаи подтверждает человек.
//
// По умолчанию сухой прогон. Запись только при APPLY=true и только там, где
// hotel_id ещё пуст: проставленное вручную не трогаем.

import { createClient } from '@supabase/supabase-js';

import { normalizeHotelTitle } from './lib/chessmateStatus.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const days = Number(process.env.DAYS ?? 30);
const apply = process.env.APPLY === 'true';

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Слова, которые сами по себе не опознают объект: встречаются у десятков отелей.
const GENERIC = new Set([
    'дом',
    'дома',
    'домик',
    'домики',
    'отель',
    'гостевой',
    'квартира',
    'квартиры',
    'апартаменты',
    'апарты',
    'под',
    'ключ',
    'гд',
    'номер',
    'номера',
    'вилла',
    'база',
    'отдыха',
    'мини',
    'на',
    'при',
    'для',
    'все',
    'нет',
]);

const words = (text) => normalizeHotelTitle(text).split(' ').filter(Boolean);

/**
 * Ищем в тексте характерные слова названия. Общие слова («домики», «отель») не
 * в счёт: иначе половина базы совпадёт с любым сообщением.
 *
 * Полного совпадения не требуем — отельеры пишут название вольно: «Киараз
 * Resort» вместо «Киараз Резорт». Хватает половины характерных слов, но хотя бы
 * одно должно найтись.
 */
const findHotel = (text, hotels) => {
    if (!text) return null;

    const haystack = ` ${normalizeHotelTitle(text)} `;
    const found = [];

    for (const hotel of hotels) {
        const meaningful = words(hotel.title).filter(
            (word) => word.length >= 3 && !GENERIC.has(word),
        );
        if (!meaningful.length) continue;

        const hits = meaningful.filter((word) => haystack.includes(` ${word} `)).length;
        if (!hits) continue;

        const score = hits / meaningful.length;
        if (score >= 0.5) found.push({ hotel, hits, score });
    }

    if (!found.length) return null;

    found.sort((left, right) => right.hits - left.hits || right.score - left.score);

    // Два разных объекта подошли одинаково хорошо — решать должен человек.
    // Так бывает у «Мореон» и «Мореон квартира 2К»: по слову «Мореон» не
    // понять, отель это или квартира.
    const [best, second] = found;
    if (second && second.hits === best.hits && second.score === best.score) return null;

    return best.hotel;
};

const main = async () => {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: hotels, error: hotelsError }, { data: messages, error: messagesError }] =
        await Promise.all([
            supabase.from('hotels').select('id, title'),
            supabase
                .from('telegram_chat_messages')
                .select('id, chat_title, author_name, text, sent_at, hotel_id')
                .gte('sent_at', since)
                .order('sent_at', { ascending: true }),
        ]);

    if (hotelsError) throw new Error(`hotels: ${hotelsError.message}`);
    if (messagesError) throw new Error(`telegram_chat_messages: ${messagesError.message}`);

    const linked = [];
    const unresolved = [];

    for (const message of messages ?? []) {
        if (message.hotel_id) continue;

        // Сначала текст: там объект называют точнее, чем в подписи.
        const hotel =
            findHotel(message.text, hotels) ?? findHotel(message.author_name, hotels) ?? null;

        if (hotel) linked.push({ message, hotel });
        else unresolved.push(message);
    }

    console.log(`Сообщений за последние ${days} дн.: ${messages?.length ?? 0}`);
    console.log(`Уже привязано ранее: ${(messages ?? []).filter((row) => row.hotel_id).length}`);
    console.log(`Определился объект: ${linked.length}`);
    console.log(`Не определился: ${unresolved.length}`);

    if (linked.length) {
        console.log('');
        console.log('=== ОПРЕДЕЛИЛИСЬ ===');
        for (const { message, hotel } of linked) {
            const text = (message.text ?? '').replace(/\s+/g, ' ').slice(0, 90);
            console.log(`  ${message.sent_at?.slice(0, 16)} · ${message.author_name ?? '—'}`);
            console.log(`    → ${hotel.title.trim()}`);
            console.log(`    «${text}»`);
        }
    }

    if (unresolved.length) {
        console.log('');
        console.log('=== НЕ ОПРЕДЕЛИЛИСЬ (нужен человек) ===');
        for (const message of unresolved) {
            const text = (message.text ?? '').replace(/\s+/g, ' ').slice(0, 120);
            console.log(`  ${message.sent_at?.slice(0, 16)} · ${message.author_name ?? '—'}: «${text}»`);
        }
    }

    if (!apply) {
        console.log('');
        console.log('Сухой прогон: ничего не записано. Запустите с apply = true, чтобы применить.');

        return;
    }

    let saved = 0;
    for (const { message, hotel } of linked) {
        const { error } = await supabase
            .from('telegram_chat_messages')
            .update({ hotel_id: hotel.id })
            .eq('id', message.id)
            .is('hotel_id', null);

        if (error) {
            console.error(`Не удалось привязать сообщение ${message.id}: ${error.message}`);
            continue;
        }
        saved += 1;
    }

    console.log('');
    console.log(`Записано привязок: ${saved}`);
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
