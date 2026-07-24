// Привязка «наш отель → чужой источник занятости» для голубых шахматок.
// Токены здесь — ПУБЛИЧНЫЕ токены виджета бронирования с сайта отеля
// (не секрет): их и так отдаёт страница бронирования. Чтение занятости
// категорийное — по каждой категории считаем «занято = номеров − свободно».

export type MirrorSystem = 'shelter';

export type MirrorCategory = {
    /** id категории в системе-источнике (FrontDesk24 roomCategoryID). */
    categoryId: number;
    /** Наши room_id этой категории, по порядку отображения в шахматке. */
    roomIds: string[];
};

export type MirrorSource = {
    system: MirrorSystem;
    /** Публичный токен виджета бронирования с сайта отеля. */
    token: string;
    /** URL страницы бронирования — только для пометки external_feed_url. */
    widgetUrl: string;
    categories: MirrorCategory[];
};

// Ключ — наш hotel_id.
export const MIRROR_SOURCES: Record<string, MirrorSource> = {
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
};

export const getMirrorSource = (hotelId: string): MirrorSource | undefined => MIRROR_SOURCES[hotelId];
