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
};

// Источник занятости голубой шахматки: Shelter (по категориям) либо
// Google-таблица отельера (по-номерно).
export type MirrorSource = ShelterMirrorSource | GoogleSheetSource;

// Ключ — наш hotel_id.
export const MIRROR_SOURCES: Record<string, MirrorSource> = {
    // «САНРАЙЗ гостевой дом» — Google-таблица (лист=месяц, столбец A=номер).
    // Лист-номера 1,2 → наши №1,2 (этаж1); 21-26 → №3-8 (этаж2); 31-36 → №9-14 (этаж3).
    '85a123c0-2b66-4dc2-826f-2999d6e6b3fe': {
        system: 'googlesheet',
        tag: 'googlesheet_sunrise',
        sheetId: '16jmZEO_nWlZSY5hVS6F7rSzAxW9CRWlhppcV3XU-lms',
        headerRow: 0,
        year: 2026,
        months: { 'Май': 5, 'Июнь': 6, 'Июль': 7, 'Август': 8, 'Сентябрь': 9 },
        roomMap: {
            '1': 1, '2': 2,
            '21': 3, '22': 4, '23': 5, '24': 6, '25': 7, '26': 8,
            '31': 9, '32': 10, '33': 11, '34': 12, '35': 13, '36': 14,
        },
        guest: 'Занято (Санрайз)',
    },
    // «Сан Амра  Sun Amra» — категория FrontDesk24 53918 «Двухкомнатные» (6 номеров).
    '97e23cef-ee78-435c-868b-b8c8afda23fa': {
        system: 'shelter',
        token: 'C16A5147-C3A7-47F6-8C2E-C4627A0B4DA1',
        widgetUrl: 'https://sun-amra.ru/book/',
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
