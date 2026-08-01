// Привязка «наш отель → чужой источник занятости» для голубых шахматок.
// Токены здесь — ПУБЛИЧНЫЕ токены виджета бронирования с сайта отеля
// (не секрет): их и так отдаёт страница бронирования. Чтение занятости
// категорийное — по каждой категории считаем «занято = номеров − свободно».

import type { GoogleSheetSource } from './googleSheet';

export type MirrorCategory = {
    /** id категории в системе-источнике (FrontDesk24 roomCategoryID). */
    categoryId: number;
    /** Наши room_id этой категории, по порядку отображения в шахматке. */
    roomIds: string[];
};

export type ShelterMirrorSource = {
    system: 'shelter';
    /** Публичный токен виджета бронирования с сайта отеля. */
    token: string;
    /** URL страницы бронирования — только для пометки external_feed_url. */
    widgetUrl: string;
    categories: MirrorCategory[];
    /**
     * Кнопка «Обновить» не читает FrontDesk24 синхронно (для многономерных
     * Сан Амра/Нора он медленный, ~200с > лимита 30с), а ЗАПУСКАЕТ фоновый
     * mirror-крон. Сам крон обновляет их и по расписанию (каждые 2 часа).
     */
    asyncCron?: boolean;
};

export type IcalMirrorSource = {
    system: 'ical';
    /** тег меток: external_source. */
    tag: string;
    /** подпись метки-занятости. */
    guest: string;
    /**
     * Категории: id публичного .ics ↔ префикс НАШИХ названий номеров этой
     * категории (room_ids резолвим из БД, чтобы не хардкодить 30 uuid).
     */
    categories: Array<{ icalId: number; titlePrefix: string }>;
};

// Источник занятости голубой шахматки: Shelter (по категориям), Google-таблица
// отельера (по-номерно) либо публичный iCal reservationsteps (по категориям).
export type MirrorSource = ShelterMirrorSource | GoogleSheetSource | IcalMirrorSource;

// Ключ — наш hotel_id.
export const MIRROR_SOURCES: Record<string, MirrorSource> = {
    // «Аврора Inn» — публичные iCal reservationsteps по 7 категориям (30 номеров).
    // Голубая: обновляется по кнопке (и автоподтяжкой при подборе). Источник
    // отдаёт только «категория занята целиком» — частичной занятости нет.
    '2a437c49-d540-4416-8c21-a15e2bbed5b6': {
        system: 'ical',
        tag: 'ical_reservationsteps',
        guest: 'Занято (Аврора, категория)',
        categories: [
            { icalId: 523508, titlePrefix: '2х местный стандарт с балконом' },
            { icalId: 523509, titlePrefix: '2х местный комфорт с балконом' },
            { icalId: 523510, titlePrefix: '2х местный стандарт с франц. балконом' },
            { icalId: 587086, titlePrefix: '3х местный номер стандарт' },
            { icalId: 523511, titlePrefix: '3х местный двухкомнатный с балконом' },
            { icalId: 523512, titlePrefix: '4х местный семейный с балконом' },
            { icalId: 618152, titlePrefix: '5-тиместный семейный номер с балконом' },
        ],
    },
    // «САНРАЙЗ гостевой дом» — Google-таблица (лист=месяц, столбец A=номер).
    // Лист-номера 1,2 → наши №1,2 (этаж1); 21-26 → №3-8 (этаж2); 31-36 → №9-14 (этаж3).
    '85a123c0-2b66-4dc2-826f-2999d6e6b3fe': {
        system: 'googlesheet',
        tag: 'googlesheet_sunrise',
        sheetId: '16jmZEO_nWlZSY5hVS6F7rSzAxW9CRWlhppcV3XU-lms',
        mode: 'merge',
        headerRow: 0,
        year: 2026,
        months: { 'Май': 5, 'Июнь': 6, 'Июль': 7, 'Август': 8, 'Сентябрь': 9 },
        roomMap: {
            '1': 1, '2': 2,
            '21': 3, '22': 4, '23': 5, '24': 6, '25': 7, '26': 8,
            '31': 9, '32': 10, '33': 11, '34': 12, '35': 13, '36': 14,
        },
        roomTitleRegex: 'номер\\s*(\\d+)',
        guest: 'Занято (Санрайз)',
    },
    // «ФЕМЕЛИ» — Google-таблица, цветовой формат (бронь = заливка фона).
    // Пока домики 1-12 (люксы в таблице сведены в 2 блока — отложено).
    'd895000d-f7d9-428e-8863-59dd5ef06d50': {
        system: 'googlesheet',
        tag: 'googlesheet_femeli',
        sheetId: '1q81E0jCexPCLelZJRJKF6TxYq_hXNPToIwk9701PFK0',
        mode: 'color',
        headerRow: 0, // в color не используется (шапка = первая строка блока)
        year: 2026,
        months: {
            'МАЙ': 5, 'ИЮНЬ': 6, 'ИЮЛЬ': 7, 'АВГУСТ': 8,
            'СЕНТЯБРЬ': 9, 'ОКТЯБРЬ': 10, 'НОЯБРЬ': 11,
        },
        labelPrefix: 'ДОМИК',
        roomTitleRegex: 'Домик\\s*(\\d+)',
        guest: 'Занято (Фемели)',
    },
    // «Сан Амра  Sun Amra» — категория FrontDesk24 53918 «Двухкомнатные» (6 номеров).
    '97e23cef-ee78-435c-868b-b8c8afda23fa': {
        system: 'shelter',
        token: 'C16A5147-C3A7-47F6-8C2E-C4627A0B4DA1',
        widgetUrl: 'https://sun-amra.ru/book/',
        asyncCron: true, // FrontDesk24 медленный → кнопка запускает фоновый крон
        categories: [
            {
                categoryId: 53918,
                roomIds: [
                    '352802ff-24e8-458f-b607-09ed6369e7dc', // 1 двухк
                    'f224b1b9-4bcd-4936-9d3e-0c0dc975edc9', // 2 двухк
                    '222565c4-6a5e-42ec-b576-72eb111706ad', // 3 двухк
                    'b8975d0e-3f36-49c0-9681-ccf7b984344a', // 4 двухк
                    'cbddcc7b-1973-4bca-8dff-dff6cc5c1b6c', // 5 двухк
                    '9260c303-e71b-4d7a-87a1-5eded6f78b72', // 6 двухк
                ],
            },
        ],
    },
    // «Студио Сан Амра» — категория FrontDesk24 57715 «Студия» (1 номер).
    'f453ac59-bde5-461b-9934-60167c72ce88': {
        system: 'shelter',
        token: 'C16A5147-C3A7-47F6-8C2E-C4627A0B4DA1',
        widgetUrl: 'https://sun-amra.ru/book/',
        categories: [
            {
                categoryId: 57715,
                roomIds: ['f328f032-b384-44f5-a522-b3bb2fee0be0'], // студия
            },
        ],
    },
    // «Нора» — FrontDesk24 категория 36753 «Стандарт» (4 номера = все наши 4).
    // Категорию 40121 «Квартира» (1 юнит) и пустую 44623 «Кваритра(new)» НЕ
    // учитываем: у нас в шахматке 4 номера, отельер подтвердил «все 4 = Стандарт».
    '1d73fbce-85fe-4290-b657-6e29ba99226c': {
        system: 'shelter',
        token: '682D8F4C-AE87-4C54-B4F9-21E34254B2D5',
        widgetUrl: 'https://pms.frontdesk24.ru/onlineWidget/full.html?token=682D8F4C-AE87-4C54-B4F9-21E34254B2D5',
        asyncCron: true, // FrontDesk24 медленный → кнопка запускает фоновый крон
        categories: [
            {
                categoryId: 36753,
                roomIds: [
                    'd1210df3-28d7-4f03-9a86-ca1eb4a56ae5', // номер 1
                    'a55d7d23-a2bf-49e9-829c-c090a6233db9', // номер 2
                    'cdcfe88c-702a-4f05-8528-07db4aab130a', // номер 3
                    'fad57533-9f12-43ce-97fe-e5ccd8779f7d', // номер 4
                ],
            },
        ],
    },
};

export const getMirrorSource = (hotelId: string): MirrorSource | undefined => MIRROR_SOURCES[hotelId];

// ---------------------------------------------------------------------------
// Голубые отели-«кроны»: у них нет источника в MIRROR_SOURCES (их синкают
// фоновые воркфлоу), но кнопка «Обновить занятость» должна работать — она
// запускает соответствующий крон (workflow_dispatch) и отвечает «запущено».
// Ключ — НОРМАЛИЗОВАННОЕ название отеля (как в chessmateHotelHeaderStatus).
// ---------------------------------------------------------------------------
export const normalizeMirrorHotelTitle = (title: string) =>
    title
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[“”"«»()\-.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const RC_WORKFLOW = 'ical-sync-cron.yml';
export const CRON_WORKFLOW_BY_TITLE: Record<string, string> = {
    // Shelter-крон (Студио синкается mirror-кроном вместе с Сан Амрой/Норой).
    'студио сан амра': 'mirror-sync-cron.yml',
    // Google/WPS-крон.
    'вилла леона': 'googlesheet-sync-cron.yml',
    // RealtyCalendar-семья (вебхук + iCal-крон).
    'барнаба': RC_WORKFLOW,
    'рита': RC_WORKFLOW,
    'александрия': RC_WORKFLOW,
    'белая лошадь white horse': RC_WORKFLOW,
    'грей хаус grey house': RC_WORKFLOW,
    'грин вилладж greenvillage': RC_WORKFLOW,
    'санни хоум': RC_WORKFLOW,
    'каво де буксо': RC_WORKFLOW,
    'эсма': RC_WORKFLOW,
    'сизон': RC_WORKFLOW,
    'дыши глубже': RC_WORKFLOW,
};
