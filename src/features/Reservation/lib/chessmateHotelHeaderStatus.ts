export type ChessmateHotelHeaderStatus = 'active' | 'mirror' | 'access' | 'request';

const normalizeHotelTitle = (title: string) =>
    title
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[“”"«»()\-.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

// Source: "СЕЗОН 2026. Описание отелей, цены", sheet "ШАХМАТКИ".
// B "АКТУАЛЬНА" -> active, C "ЕСТЬ ДОСТУП" -> access, D "ПО ЗАПРОСУ" -> request.
// Объекты с интеграцией RealtyCalendar всегда active (зелёные), даже если в таблице столбец C.
// «Голубые» шахматки — зеркало чужого календаря с кнопкой «Обновить занятость»
// (см. src/app/api/mirror/*). Здесь только список для цвета/фильтра шапки;
// привязка отель→источник лежит на сервере в mirrorSources.ts.
const MIRROR_HOTEL_TITLES = new Set<string>([
    'сан амра sun amra',
    // «Студио Сан Амра» — один номер, поэтому НЕ голубая (кнопка не нужна),
    // а зелёная с автосинхронизацией из FrontDesk24 (крон mirror-sync-cron).
    // «Нора» — Shelter/FrontDesk24, категория «Стандарт» (4 номера = все наши 4).
    'нора',
    // «САНРАЙЗ гостевой дом» — Google-таблица отельера (по-номерно, 14 номеров).
    // Кнопка «Обновить» читает таблицу; плюс крон обновляет её каждый час.
    'санрайз гостевой дом',
    // «ФЕМЕЛИ» — Google-таблица, цветовой формат (домики 1-12; люксы отложены).
    'фемели',
    // «Аврора Inn» — iCal reservationsteps по категориям. Кнопка «Обновить»
    // запускает фоновый mirror-крон (см. CRON_ONLY_MIRROR_HOTEL_TITLES
    // в mirrorSources.ts); плюс крон обновляет её каждые 2 часа.
    'аврора inn',
]);

const REALTYCALENDAR_INTEGRATED_HOTEL_TITLES = new Set<string>([
    'барнаба',
    'рита',
    'александрия',
    'белая лошадь white horse',
    'грей хаус grey house',
    'грин вилладж greenvillage',
    'санни хоум',
    'каво де буксо',
    'эсма',
    'сизон',
    'дыши глубже',
]);

const CHESSMATE_STATUS_BY_HOTEL_TITLE: Record<string, ChessmateHotelHeaderStatus> = {
    абаза: 'request',
    абырлаш: 'request',
    'адунеи гостевой дом': 'active',
    // «Аврора Inn» — голубая (см. MIRROR_HOTEL_TITLES выше), запись из карты убрана.
    'аквамарин дом под ключ': 'active',
    александрия: 'access',
    амзара: 'request',
    'амина дом под ключ': 'active',
    амор: 'active',
    апра: 'active',
    'апса apsa': 'request',
    арина: 'active',
    ассир: 'active',
    'багрипш домики на берегу с питанием': 'active',
    'банан и фундук': 'active',
    'белая дача': 'active',
    'белая лошадь white horse': 'access',
    'белый дом': 'request',
    бельведер: 'active',
    бригантина: 'active',
    бриз: 'active',
    бзыбь: 'access',
    'би хэппи be happy': 'active',
    бугенвиллея: 'active',
    белочка: 'active',
    'в синопе': 'active',
    'вилла лаванда': 'request',
    'вилла любовь': 'active',
    'восходящая звезда': 'active',
    'грант grant': 'access',
    'грей хаус grey house': 'access',
    'грейс квартира 2к': 'active',
    'грин вилладж greenvillage': 'access',
    'грин хаус green house': 'active',
    дамира: 'access',
    данелян: 'access',
    дельфин: 'active',
    'демимокко demi mokko': 'active',
    джаннат: 'access',
    'домики у марины': 'active',
    'дыши глубже': 'access',
    'зеленый дворик': 'active',
    'каво де буксо': 'access',
    камелия: 'active',
    'каралина апартаменты': 'active',
    карин: 'active',
    'кастл castle': 'active',
    'кира guest house kira': 'active',
    'киараз резорт': 'active',
    крылья: 'active',
    лазурит: 'access',
    лайм: 'active',
    лемар: 'access',
    'лето квартира 2к': 'active',
    лимон: 'access',
    мадлена: 'active',
    'мандариновый дворик дом под ключ': 'active',
    'маре дольче': 'access',
    мзия: 'active',
    мика: 'active',
    'мокко апартаменты': 'active',
    мореон: 'active',
    'мореон квартира 2к': 'active',
    'морская лагуна': 'active',
    мулберри: 'active',
    'на время в раю полдома под ключ': 'active',
    николь: 'active',
    никопсия: 'active',
    нора: 'access',
    парус: 'active',
    пегас: 'active',
    'песчаный берег апартаменты': 'active',
    'пляжный комплекс 151': 'active',
    'райский берег': 'active',
    'ранчо эли вэл': 'active',
    рита: 'access',
    'сан амра sun amra': 'access',
    'студио сан амра': 'active',
    'сан пино sun pino': 'access',
    'санди хаус': 'active',
    'санни хоум': 'access',
    'санрайз гостевой дом': 'access',
    'сансет sunset квартира 2к': 'active',
    'сансет домики': 'access',
    'секрет гарден апартаменты': 'active',
    'сизон': 'access',
    симона: 'active',
    'сисайд хаус seasidehouse': 'access',
    'старый причал': 'access',
    'сухум дом под ключ': 'active',
    тис: 'access',
    'феникс дом под ключ': 'active',
    'фламинго гостевой дом': 'active',
    'флора flora дом': 'active',
    эсма: 'access',

    // Квартиры и дома — ведём сами, всегда актуальны (решение Дарьи 30.07.2026).
    'акварель три 2к квартиры': 'active',
    'акира квартира 2к': 'active',
    'акиртава квартира 3к': 'active',
    'аниса квартира 1к': 'active',
    'арго квартира 1к': 'active',
    'атмосферная квартира 2к': 'active',
    'афина квартира 2к': 'active',
    'бирюза апартаменты': 'active',
    'виктория квартира 2к': 'active',
    'заречный этаж в доме под ключ': 'active',
    'камилла квартира 2к': 'active',
    'кипарисовая квартира 1к': 'active',
    'классика квартира 2к': 'active',
    'курортная квартира 2к': 'active',
    'ладария 1к квартира': 'active',
    'летняя квартира 3к': 'active',
    'магнолия квартира 3к': 'active',
    'мансарда квартира 2к': 'active',
    'мелана квартира 3к': 'active',
    'мечта аппартаменты': 'active',
    'мимоза квартира 3к': 'active',
    'мира дом под ключ': 'active',
    'мия дом под ключ': 'active',
    'мон амур monamour квартира 1к': 'active',
    'монро квартира 3к': 'active',
    'на высоте квартира 2к': 'active',
    'на пляже квартира 3к': 'active',
    'нонна квартира 2к': 'active',
    'пальма квартира 3к': 'active',
    'парковая квартира 2к': 'active',
    'питиунт квартира 4к': 'active',
    'семейная квартира 2к': 'active',
    'сити гагра citygagra квартира 2к': 'active',
    'солнечная квартира 2к': 'active',
    'сосновая квартира 1к': 'active',
    'тихая обитель дом под ключ': 'active',
    'центральный дом под ключ': 'active',
    'черноморские квартиры 2к': 'active',
    'южное утро и тихая бухта апартаменты': 'active',
};

export const CHESSMATE_HOTEL_HEADER_STATUS_OPTIONS: {
    value: ChessmateHotelHeaderStatus;
    label: string;
}[] = [
    { value: 'active', label: 'Актуальные' },
    { value: 'mirror', label: 'Голубые (зеркало)' },
    { value: 'access', label: 'Есть доступ' },
    { value: 'request', label: 'Белые / по запросу' },
];

// Голубые (mirror) идут в одной группе с зелёными (active) и сортируются
// вперемешку по алфавиту — цвет их всё равно различает. Дальше жёлтые, белые.
const CHESSMATE_STATUS_ORDER: Record<ChessmateHotelHeaderStatus, number> = {
    active: 0,
    mirror: 0,
    access: 1,
    request: 2,
};

export const getChessmateHotelHeaderStatus = (
    title?: string | null,
): ChessmateHotelHeaderStatus | undefined => {
    if (!title) return undefined;

    const normalizedTitle = normalizeHotelTitle(title);

    // Голубые (зеркало) — приоритетнее прочих статусов.
    if (MIRROR_HOTEL_TITLES.has(normalizedTitle)) {
        return 'mirror';
    }

    if (REALTYCALENDAR_INTEGRATED_HOTEL_TITLES.has(normalizedTitle)) {
        return 'active';
    }

    return CHESSMATE_STATUS_BY_HOTEL_TITLE[normalizedTitle];
};

export const getChessmateHotelHeaderStatusOrder = (title?: string | null) => {
    const status = getChessmateHotelHeaderStatus(title);

    return status ? CHESSMATE_STATUS_ORDER[status] : CHESSMATE_STATUS_ORDER.request;
};

export const sortByChessmateHotelHeaderStatus = <
    T extends { title?: string | null; id?: string | null },
>(
    rows: T[],
) => {
    return [...rows].sort((left, right) => {
        const statusDiff =
            getChessmateHotelHeaderStatusOrder(left.title) -
            getChessmateHotelHeaderStatusOrder(right.title);

        if (statusDiff !== 0) {
            return statusDiff;
        }

        const titleDiff = (left.title ?? '').localeCompare(right.title ?? '', 'ru');

        if (titleDiff !== 0) {
            return titleDiff;
        }

        // Tie-breaker по id: при одинаковых названиях порядок должен быть
        // одинаковым между запросами страниц, иначе возможны дубли при скролле.
        return (left.id ?? '').localeCompare(right.id ?? '');
    });
};
