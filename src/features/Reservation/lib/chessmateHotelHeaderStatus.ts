export type ChessmateHotelHeaderStatus = 'active' | 'access' | 'request';

const normalizeHotelTitle = (title: string) =>
    title
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[“”"«»()\-.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

// Source: "СЕЗОН 2026. Описание отелей, цены", sheet "ШАХМАТКИ".
// B "АКТУАЛЬНА" -> active, C "ЕСТЬ ДОСТУП" -> access, D "ПО ЗАПРОСУ" -> request.
const CHESSMATE_STATUS_BY_HOTEL_TITLE: Record<string, ChessmateHotelHeaderStatus> = {
    абаза: 'request',
    абырлаш: 'request',
    'аврора inn': 'access',
    'аквамарин дом под ключ': 'active',
    александрия: 'active',
    амзара: 'request',
    'амина дом под ключ': 'active',
    амор: 'active',
    апра: 'active',
    'апса apsa': 'request',
    арина: 'active',
    ассир: 'active',
    'багрипш домики на берегу с питанием': 'active',
    'банан и фундук': 'active',
    'белая лошадь white horse': 'active',
    бзыбь: 'access',
    'би хэппи be happy': 'active',
    бугенвиллея: 'active',
    белочка: 'active',
    'в синопе': 'active',
    'вилла лаванда': 'request',
    'вилла любовь': 'active',
    'восходящая звезда': 'active',
    'грант grant': 'access',
    'грей хаус grey house': 'active',
    'грейс квартира 2к': 'active',
    'грин вилладж greenvillage': 'active',
    'грин хаус green house': 'active',
    дамира: 'access',
    данелян: 'access',
    дельфин: 'active',
    'демимокко demi mokko': 'active',
    джаннат: 'access',
    'домики у марины': 'active',
    'дыши глубже': 'access',
    'зеленый дворик': 'active',
    'каво де буксо': 'active',
    камелия: 'active',
    'каралина апартаменты': 'active',
    карин: 'active',
    'кастл castle': 'active',
    'кира guest house kira': 'active',
    крылья: 'active',
    лазурит: 'access',
    лайм: 'active',
    лемар: 'access',
    лимон: 'access',
    мадлена: 'active',
    'мандариновый дворик дом под ключ': 'access',
    'маре дольче': 'access',
    мзия: 'active',
    мика: 'active',
    'мокко апартаменты': 'active',
    мореон: 'active',
    'мореон квартира 2к': 'active',
    'морская лагуна': 'active',
    мулберри: 'active',
    'на время в раю полдома под ключ': 'access',
    николь: 'active',
    никопсия: 'active',
    нора: 'access',
    парус: 'active',
    пегас: 'active',
    'песчаный берег апартаменты': 'active',
    'пляжный комплекс 151': 'active',
    'ранчо эли вэл': 'active',
    рита: 'active',
    'сан амра sun amra': 'access',
    'сан пино sun pino': 'access',
    'санди хаус': 'active',
    'санни хоум': 'active',
    'санрайз гостевой дом': 'access',
    'сансет sunset квартира 2к': 'active',
    'сансет домики': 'access',
    'секрет гарден апартаменты': 'active',
    'сизон': 'active',
    симона: 'active',
    'сисайд хаус seasidehouse': 'access',
    'старый причал': 'access',
    'сухум дом под ключ': 'active',
    тис: 'active',
    'феникс дом под ключ': 'active',
    'флора flora дом': 'active',
    эсма: 'active',
};

export const CHESSMATE_HOTEL_HEADER_STATUS_OPTIONS: {
    value: ChessmateHotelHeaderStatus;
    label: string;
}[] = [
    { value: 'active', label: 'Актуальные' },
    { value: 'access', label: 'Есть доступ' },
    { value: 'request', label: 'Белые / по запросу' },
];

const CHESSMATE_STATUS_ORDER: Record<ChessmateHotelHeaderStatus, number> = {
    active: 0,
    access: 1,
    request: 2,
};

export const getChessmateHotelHeaderStatus = (
    title?: string | null,
): ChessmateHotelHeaderStatus | undefined => {
    if (!title) return undefined;

    return CHESSMATE_STATUS_BY_HOTEL_TITLE[normalizeHotelTitle(title)];
};

export const getChessmateHotelHeaderStatusOrder = (title?: string | null) => {
    const status = getChessmateHotelHeaderStatus(title);

    return status ? CHESSMATE_STATUS_ORDER[status] : CHESSMATE_STATUS_ORDER.request;
};

export const sortByChessmateHotelHeaderStatus = <T extends { title?: string | null }>(
    rows: T[],
) => {
    return [...rows].sort((left, right) => {
        const statusDiff =
            getChessmateHotelHeaderStatusOrder(left.title) -
            getChessmateHotelHeaderStatusOrder(right.title);

        if (statusDiff !== 0) {
            return statusDiff;
        }

        return (left.title ?? '').localeCompare(right.title ?? '', 'ru');
    });
};
