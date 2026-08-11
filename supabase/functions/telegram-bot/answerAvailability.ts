import type { SupabaseClient } from '@supabase/supabase-js';

import { DEFAULT_CITIES, getChessmateHotelHeaderStatus } from './_shared/chessmate.ts';
import type { ManagerQuery } from './parseManagerQuery.ts';

const ROOM_CLOSURE_CHUNK = 100;
const MAX_HOTELS_IN_ANSWER = 40;
const MAX_ROOMS_PER_HOTEL = 4;
const MOSCOW_UTC_OFFSET_HOURS = 3;
const CHECK_IN_HOUR_MSK = 14;
const CHECK_OUT_HOUR_MSK = 12;

const CITY_LABEL = new Map<string, string>(
    DEFAULT_CITIES.map((city) => [city.value, city.label]),
);
const CITY_ORDER = [
    'gagra',
    'candripsh',
    'pitsunda',
    'ldzaa',
    'alahadzy',
    'gudauta',
    'new-athon',
    'sukhumi',
];

type RpcRoom = { room_id?: string; id?: string; room_title?: string; title?: string };
type RpcRow = { hotel_id?: string; hotel_title?: string; rooms?: unknown };
type HotelRow = {
    id: string;
    title: string | null;
    city: string | null;
    telegram_url: string | null;
    is_search_visible: boolean | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parseRooms = (rooms: unknown): { id: string; title: string }[] => {
    let parsed = rooms;

    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return [];
        }
    }

    if (!Array.isArray(parsed)) return [];

    return parsed
        .map((room) => {
            if (!isRecord(room)) return null;

            const value = room as RpcRoom;
            const id = value.room_id ?? value.id;
            if (typeof id !== 'string' || !id) return null;

            return { id, title: (value.room_title ?? value.title ?? '').trim() };
        })
        .filter((room): room is { id: string; title: string } => room !== null);
};

const toMoscowStayUnix = (year: number, month: number, day: number, endOfStay: boolean) => {
    const hourMsk = endOfStay ? CHECK_OUT_HOUR_MSK : CHECK_IN_HOUR_MSK;

    return Math.floor(
        Date.UTC(year, month - 1, day, hourMsk - MOSCOW_UTC_OFFSET_HOURS, 0, 0, 0) / 1000,
    );
};

const toDateParts = (iso: string) => iso.split('-').map(Number) as [number, number, number];

const formatDate = (iso: string) => {
    const [, month, day] = toDateParts(iso);

    return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
};

const formatHotelLink = (telegramUrl: string | null) => {
    if (!telegramUrl) return null;

    return telegramUrl
        .replace(/^https?:\/\//, '')
        .replace('абхазберег.рф', 'abhazbereg.com')
        .replace(/\/$/, '');
};

const getClosedRoomIds = async (
    supabase: SupabaseClient,
    roomIds: string[],
    start: number,
    end: number,
) => {
    const closed = new Set<string>();

    for (let index = 0; index < roomIds.length; index += ROOM_CLOSURE_CHUNK) {
        const chunk = roomIds.slice(index, index + ROOM_CLOSURE_CHUNK);
        const { data, error } = await supabase
            .from('room_closures')
            .select('room_id')
            .in('room_id', chunk)
            .lt('start', end)
            .gt('end', start);

        if (error) throw error;

        for (const closure of data ?? []) {
            if (typeof closure.room_id === 'string') closed.add(closure.room_id);
        }
    }

    return closed;
};

export const buildAvailabilityAnswer = async (
    supabase: SupabaseClient,
    query: ManagerQuery,
): Promise<string> => {
    const [startYear, startMonth, startDay] = toDateParts(query.startDate);
    const [endYear, endMonth, endDay] = toDateParts(query.endDate);
    const startTime = toMoscowStayUnix(startYear, startMonth, startDay, false);
    const endTime = toMoscowStayUnix(endYear, endMonth, endDay, true);

    const { data, error } = await supabase.rpc('get_available_hotels', {
        start_time: startTime,
        end_time: endTime,
        room_type_filter: null,
        min_quantity_filter: null,
        city_filter: query.cities.length ? query.cities : null,
        room_features_filter: null,
        features_filter: null,
        eat_filter: null,
        beach_filter: null,
        beach_distance_filter: null,
        min_price_filter: null,
        max_price_filter: null,
    });

    if (error) throw error;

    const rows = (Array.isArray(data) ? data : []) as RpcRow[];
    const roomsByHotel = new Map<string, { id: string; title: string }[]>();

    for (const row of rows) {
        if (typeof row.hotel_id !== 'string' || !row.hotel_id) continue;

        const rooms = parseRooms(row.rooms);
        if (!rooms.length) continue;

        const existing = roomsByHotel.get(row.hotel_id) ?? [];
        roomsByHotel.set(row.hotel_id, [...existing, ...rooms]);
    }

    if (!roomsByHotel.size) {
        return `На ${formatDate(query.startDate)}–${formatDate(query.endDate)} свободных номеров не нашлось.`;
    }

    const hotelsResponse = await supabase
        .from('hotels')
        .select('id, title, city, telegram_url, is_search_visible')
        .in('id', Array.from(roomsByHotel.keys()));

    if (hotelsResponse.error) throw hotelsResponse.error;

    const allRoomIds = Array.from(
        new Set(Array.from(roomsByHotel.values()).flatMap((rooms) => rooms.map((room) => room.id))),
    );
    const closedRoomIds = await getClosedRoomIds(supabase, allRoomIds, startTime, endTime);

    const byCity = new Map<string, string[]>();
    let shownHotels = 0;
    let hiddenHotels = 0;

    const hotels = ((hotelsResponse.data ?? []) as HotelRow[])
        .filter((hotel) => hotel.is_search_visible !== false)
        .filter((hotel) => {
            const status = getChessmateHotelHeaderStatus(hotel.title);

            return status === 'active' || status === 'mirror';
        })
        .sort((left, right) => (left.title ?? '').localeCompare(right.title ?? '', 'ru'));

    for (const hotel of hotels) {
        const rooms = (roomsByHotel.get(hotel.id) ?? []).filter(
            (room) => !closedRoomIds.has(room.id),
        );
        if (!rooms.length) continue;

        if (shownHotels >= MAX_HOTELS_IN_ANSWER) {
            hiddenHotels += 1;
            continue;
        }
        shownHotels += 1;

        const status = getChessmateHotelHeaderStatus(hotel.title);
        const marker = status === 'mirror' ? '🔵' : '🟢';
        const titles = rooms.slice(0, MAX_ROOMS_PER_HOTEL).map((room) => room.title || 'номер');
        const more = rooms.length - titles.length;
        const roomsText = titles.join(' • ') + (more > 0 ? ` +ещё ${more}` : '');
        const link = formatHotelLink(hotel.telegram_url);

        const lines = [`${marker} ${hotel.title ?? ''} — ${rooms.length} своб.: ${roomsText}`];
        if (link) lines.push(link);

        const cityKey = hotel.city ?? '';
        byCity.set(cityKey, [...(byCity.get(cityKey) ?? []), lines.join('\n')]);
    }

    if (!byCity.size) {
        return (
            `На ${formatDate(query.startDate)}–${formatDate(query.endDate)} свободных номеров ` +
            'в зелёных и голубых шахматках нет.'
        );
    }

    const cityKeys = Array.from(byCity.keys()).sort((left, right) => {
        const leftIndex = CITY_ORDER.indexOf(left);
        const rightIndex = CITY_ORDER.indexOf(right);

        return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    });

    const header =
        `🔎 Свободно ${formatDate(query.startDate)}–${formatDate(query.endDate)}` +
        (query.guests ? ` (запрос на ${query.guests} чел.)` : '');
    const parts = [header, ''];

    for (const cityKey of cityKeys) {
        parts.push(`📍 ${CITY_LABEL.get(cityKey) ?? cityKey ?? 'Без города'}`);
        parts.push(...(byCity.get(cityKey) ?? []));
        parts.push('');
    }

    if (hiddenHotels > 0) {
        parts.push(`…и ещё ${hiddenHotels} отелей — уточните город, чтобы список был короче.`);
    }

    parts.push('🟢 ведёт человек • 🔵 автосинхронизация');

    if (query.guests) {
        parts.push('Вместимость номеров бот не проверяет — смотрите названия категорий.');
    }

    return parts.join('\n').trim();
};
