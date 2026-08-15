// Проставить городу отеля значение, когда поле пустое.
//
// Зачем: без города объект выпадает из группировки по населённым пунктам в
// подборках и не находится, когда менеджер спрашивает бота про конкретный
// город. Так было у «МАНСАРДА квартира 2К».
//
// Осторожность: это запись в рабочую базу. Поэтому здесь три предохранителя —
// сухой прогон по умолчанию, обновление только пустого города (заполненный не
// перезаписываем) и проверка города по списку из приложения.

import { createClient } from '@supabase/supabase-js';

import { normalizeHotelTitle } from './lib/chessmateStatus.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

// Значения — как в src/features/AdvancedFilters/lib/constants.ts.
const CITIES = {
    sukhumi: 'Сухум',
    'new-athon': 'Новый Афон',
    gudauta: 'Гудаута',
    ldzaa: 'Лдзаа',
    pitsunda: 'Пицунда',
    alahadzy: 'Алахадзы',
    gagra: 'Гагра',
    candripsh: 'Цандрипш',
};

const title = (process.env.HOTEL_TITLE ?? '').trim();
const city = (process.env.CITY ?? '').trim();
const apply = process.env.APPLY === 'true';

const supabase = createClient(url, key, { auth: { persistSession: false } });

const main = async () => {
    const { data: hotels, error } = await supabase.from('hotels').select('id, title, city');
    if (error) throw new Error(`hotels: ${error.message}`);

    const withoutCity = hotels.filter((hotel) => !(hotel.city ?? '').trim());

    console.log(`Отелей без города: ${withoutCity.length}`);
    for (const hotel of withoutCity) {
        console.log(`  ${(hotel.title ?? '').trim()}`);
    }

    if (!title) {
        console.log('');
        console.log('HOTEL_TITLE не задан — только показал список, ничего не менял.');

        return;
    }

    if (!CITIES[city]) {
        throw new Error(
            `Неизвестный город «${city}». Допустимые значения: ${Object.keys(CITIES).join(', ')}`,
        );
    }

    const normalized = normalizeHotelTitle(title);
    const matches = hotels.filter((hotel) => normalizeHotelTitle(hotel.title) === normalized);

    if (!matches.length) throw new Error(`Отель «${title}» не найден`);
    if (matches.length > 1) throw new Error(`Под «${title}» подходит ${matches.length} отелей — уточните название`);

    const hotel = matches[0];
    const currentCity = (hotel.city ?? '').trim();

    console.log('');
    console.log(`Отель: ${(hotel.title ?? '').trim()}`);
    console.log(`Город сейчас: ${currentCity || '(пусто)'}`);
    console.log(`Город станет: ${city} (${CITIES[city]})`);

    if (currentCity) {
        console.log('');
        console.log('Город уже заполнен — не трогаю. Заполненные значения этот скрипт не перезаписывает.');

        return;
    }

    if (!apply) {
        console.log('');
        console.log('Сухой прогон: ничего не изменено. Запустите с apply = true, чтобы применить.');

        return;
    }

    const { error: updateError } = await supabase
        .from('hotels')
        .update({ city })
        .eq('id', hotel.id)
        .is('city', null);

    if (updateError) throw new Error(`update: ${updateError.message}`);

    const { data: after, error: afterError } = await supabase
        .from('hotels')
        .select('title, city')
        .eq('id', hotel.id)
        .maybeSingle();

    if (afterError) throw new Error(`check: ${afterError.message}`);

    console.log('');
    console.log(`Готово: ${(after?.title ?? '').trim()} — город «${after?.city ?? '(пусто)'}»`);
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
