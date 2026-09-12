// Скрыть отель из подбора или вернуть его обратно.
//
// Зачем: когда с отелем перестают работать, запись удалять нельзя — на ней
// висят брони живых гостей и вся выручка за сезон. Правильное действие —
// убрать объект из поиска и подбора, оставив историю нетронутой. В карточке
// отеля это галочка «Скрытый отель» (поле is_search_visible).
//
// Осторожность: это запись в рабочую базу. Предохранители:
//   • сухой прогон по умолчанию — сначала показываем, что изменится;
//   • название должно совпасть ровно с одним объектом;
//   • если нужное значение уже стоит, ничего не пишем;
//   • запись идёт с проверкой прежнего значения, поэтому чужая правка,
//     сделанная между чтением и записью, не будет затёрта незаметно;
//   • после записи перечитываем и показываем, что получилось.
//
// Броней, номеров и занятости скрипт не касается вообще.

import { createClient } from '@supabase/supabase-js';

import { normalizeHotelTitle } from './lib/chessmateStatus.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const title = (process.env.HOTEL_TITLE ?? '').trim();
const hiddenInput = (process.env.HIDDEN ?? 'true').trim().toLowerCase();
const apply = process.env.APPLY === 'true';

if (!title) throw new Error('HOTEL_TITLE обязателен');
if (!['true', 'false'].includes(hiddenInput)) {
    throw new Error(`HIDDEN должен быть true или false, получено «${hiddenInput}»`);
}

// Скрытый отель — это is_search_visible = false. Пустое значение в базе
// означает «виден»: так заведены все старые записи.
const shouldHide = hiddenInput === 'true';
const nextVisible = !shouldHide;

const supabase = createClient(url, key, { auth: { persistSession: false } });

const describe = (visible) => (visible === false ? 'скрыт из подбора' : 'виден в подборе');

const main = async () => {
    const { data: hotels, error } = await supabase
        .from('hotels')
        .select('id, title, city, is_search_visible');
    if (error) throw new Error(`hotels: ${error.message}`);

    const normalized = normalizeHotelTitle(title);
    const matches = (hotels ?? []).filter((hotel) => normalizeHotelTitle(hotel.title) === normalized);

    if (!matches.length) throw new Error(`Отель «${title}» не найден`);
    if (matches.length > 1) {
        throw new Error(`Под «${title}» подходит ${matches.length} отелей — уточните название`);
    }

    const hotel = matches[0];
    const currentVisible = hotel.is_search_visible;

    console.log(`Отель: ${(hotel.title ?? '').trim()}`);
    console.log(`  город: ${(hotel.city ?? '').trim() || '(пусто)'}`);
    console.log(`  сейчас: ${describe(currentVisible)}`);
    console.log(`  станет: ${describe(nextVisible)}`);

    if (currentVisible === nextVisible || (currentVisible == null && nextVisible === true)) {
        console.log('');
        console.log('Нужное значение уже стоит — ничего не меняю.');

        return;
    }

    if (!apply) {
        console.log('');
        console.log('Сухой прогон: ничего не изменено. Запустите с apply = true, чтобы применить.');

        return;
    }

    // Пишем только поверх того значения, которое прочитали. Если кто-то
    // переключил галочку в карточке в эту же секунду, запись не пройдёт.
    let query = supabase.from('hotels').update({ is_search_visible: nextVisible }).eq('id', hotel.id);
    query = currentVisible == null ? query.is('is_search_visible', null) : query.eq('is_search_visible', currentVisible);

    const { error: updateError } = await query;
    if (updateError) throw new Error(`update: ${updateError.message}`);

    const { data: after, error: afterError } = await supabase
        .from('hotels')
        .select('title, is_search_visible')
        .eq('id', hotel.id)
        .maybeSingle();
    if (afterError) throw new Error(`check: ${afterError.message}`);

    if (after?.is_search_visible !== nextVisible) {
        throw new Error(
            `Значение не изменилось: «${(after?.title ?? '').trim()}» — ${describe(after?.is_search_visible)}. ` +
                'Похоже, кто-то правил карточку одновременно. Повторите прогон.',
        );
    }

    console.log('');
    console.log(`Готово: ${(after?.title ?? '').trim()} — ${describe(after?.is_search_visible)}`);
    console.log('Брони, номера и занятость не тронуты.');
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
