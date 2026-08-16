// Точечная безопасная установка hotels.telegram_url.
//
// Ссылка ведёт либо на карточку сайта (/hotels/ или /kvartira/), либо на пост
// с карточкой объекта в нашем канале Telegram. Второе — не исключение: у части
// объектов страницы на сайте просто нет, и пост в канале для них единственная
// карточка. Так уже сделано у «Асман» и «МАНСАРДА квартира 2К».

import { createClient } from '@supabase/supabase-js';
import { normalizeCatalogPath } from './lib/shortHotelLinks.mjs';

const TELEGRAM_CARD = /^https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+$/;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const title = String(process.env.HOTEL_TITLE ?? '').trim();
const newUrl = String(process.env.HOTEL_URL ?? '').trim();
const apply = process.env.APPLY === 'true';
const confirmation = process.env.CONFIRMATION ?? '';

if (!url || !key) throw new Error('Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
if (!title || !newUrl) throw new Error('Нужны HOTEL_TITLE и HOTEL_URL');
if (!normalizeCatalogPath(newUrl) && !TELEGRAM_CARD.test(newUrl)) {
    throw new Error(
        'HOTEL_URL должен вести в /hotels/, /kvartira/ или на пост канала вида https://t.me/канал/номер',
    );
}

const response = await fetch(newUrl, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
if (response.status !== 200) throw new Error(`Ссылка не прошла проверку: HTTP ${response.status}`);

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data: matches, error } = await supabase.from('hotels').select('id,title,telegram_url').ilike('title', title);
if (error) throw error;
if (matches.length !== 1) throw new Error(`Найдено объектов: ${matches.length}; требуется ровно один`);

const hotel = matches[0];
console.log(`Объект: ${hotel.title}`);
console.log(`Было: ${hotel.telegram_url || '(пусто)'}`);
console.log(`Станет: ${newUrl}`);
console.log(`Проверка: HTTP ${response.status}`);

if (!apply) {
    console.log('Сухой прогон: база не изменена.');
} else {
    if (confirmation !== 'UPDATE_HOTEL_LINK') throw new Error('Неверная контрольная фраза');
    const query = supabase.from('hotels').update({ telegram_url: newUrl }).eq('id', hotel.id);
    const guarded = hotel.telegram_url
        ? query.eq('telegram_url', hotel.telegram_url)
        : query.or('telegram_url.is.null,telegram_url.eq.');
    const { error: updateError } = await guarded;
    if (updateError) throw updateError;
    console.log('Готово: ссылка обновлена.');
}

