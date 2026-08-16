// Точечная безопасная установка hotels.telegram_url.

import { createClient } from '@supabase/supabase-js';
import { normalizeCatalogPath } from './lib/shortHotelLinks.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const title = String(process.env.HOTEL_TITLE ?? '').trim();
const newUrl = String(process.env.HOTEL_URL ?? '').trim();
const apply = process.env.APPLY === 'true';
const confirmation = process.env.CONFIRMATION ?? '';

if (!url || !key) throw new Error('Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
if (!title || !newUrl) throw new Error('Нужны HOTEL_TITLE и HOTEL_URL');
if (!normalizeCatalogPath(newUrl)) throw new Error('HOTEL_URL должен вести в /hotels/ или /kvartira/');

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

