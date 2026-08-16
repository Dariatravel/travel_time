// Проставить ссылку на объект (hotels.telegram_url), когда её нет.
//
// Зачем: без ссылки объект попадает в подборку и в ответ бота «слепым» —
// гостю некуда перейти, менеджеру нечего отправить. Так было у «Блэк Си»
// и «Грасс».
//
// Ссылка хранится в том же виде, что и у остальных объектов: адрес на
// абхазберег.рф. В подборках и ответах бота домен подменяется на
// abhazbereg.com, а «https://» убирается — это делает код отображения, а не
// хранилище, поэтому вид записи менять не нужно.
//
// Осторожность: это запись в рабочую базу. Сухой прогон по умолчанию,
// заполненную ссылку не перезаписываем.

import { createClient } from '@supabase/supabase-js';

import { normalizeHotelTitle } from './lib/chessmateStatus.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const title = (process.env.HOTEL_TITLE ?? '').trim();
const rawLink = (process.env.LINK ?? '').trim();
const apply = process.env.APPLY === 'true';

const supabase = createClient(url, key, { auth: { persistSession: false } });

/** Приводим к виду остальных записей: кириллический домен, без завершающего слэша. */
const normalizeLink = (value) => {
    let link = value.replace(/\s+/g, '');
    if (!link) return '';

    link = link
        .replace('xn--80aacbklan7f0b.xn--p1ai', 'абхазберег.рф')
        .replace('abhazbereg.com', 'абхазберег.рф');

    if (!/^https?:\/\//.test(link)) link = `https://${link}`;

    return link.replace(/\/+$/, '');
};

const main = async () => {
    const { data: hotels, error } = await supabase.from('hotels').select('id, title, telegram_url');
    if (error) throw new Error(`hotels: ${error.message}`);

    const withoutLink = hotels.filter((hotel) => !(hotel.telegram_url ?? '').trim());

    console.log(`Объектов без ссылки: ${withoutLink.length}`);
    for (const hotel of withoutLink) console.log(`  ${(hotel.title ?? '').trim()}`);

    if (!title) {
        console.log('');
        console.log('HOTEL_TITLE не задан — только показал список, ничего не менял.');

        return;
    }

    const link = normalizeLink(rawLink);
    if (!link) throw new Error('LINK не задан');

    const normalized = normalizeHotelTitle(title);
    const matches = hotels.filter((hotel) => normalizeHotelTitle(hotel.title) === normalized);

    if (!matches.length) throw new Error(`Объект «${title}» не найден`);
    if (matches.length > 1) {
        throw new Error(`Под «${title}» подходит ${matches.length} объектов — уточните название`);
    }

    const hotel = matches[0];
    const current = (hotel.telegram_url ?? '').trim();

    console.log('');
    console.log(`Объект: ${(hotel.title ?? '').trim()}`);
    console.log(`Ссылка сейчас: ${current || '(пусто)'}`);
    console.log(`Ссылка станет: ${link}`);

    if (current) {
        console.log('');
        console.log('Ссылка уже заполнена — не трогаю.');

        return;
    }

    if (!apply) {
        console.log('');
        console.log('Сухой прогон: ничего не изменено. Запустите с apply = true, чтобы применить.');

        return;
    }

    const { error: updateError } = await supabase
        .from('hotels')
        .update({ telegram_url: link })
        .eq('id', hotel.id)
        .is('telegram_url', null);

    if (updateError) throw new Error(`update: ${updateError.message}`);

    const { data: after, error: afterError } = await supabase
        .from('hotels')
        .select('title, telegram_url')
        .eq('id', hotel.id)
        .maybeSingle();

    if (afterError) throw new Error(`check: ${afterError.message}`);

    console.log('');
    console.log(`Готово: ${(after?.title ?? '').trim()} — ${after?.telegram_url ?? '(пусто)'}`);
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
