// Читалка занятости из модуля бронирования Контур (bookonline24.ru).
// Публичный API, без токена. Данные — по КАЖДОМУ номеру (у объекта каждая
// «категория» = один физический номер).
//
// Контракт (снят с живого виджета):
//   GET  /api/v1/daily/{slug}/entities                       → список номеров
//   POST /api/v1/daily/{slug}/accommodation-prices/all       → варианты размещения
//        body {dateFrom, dateTo, adultsCount, children:[], roomCategoryId}
//        ответ [{availableCount, ...}] — availableCount>0 = свободно
//
// ⚠️ ЛОВУШКА: ноль свободных значит либо «занято», либо «продажи не открыты».
// Отличаем по ГОРИЗОНТУ ПРОДАЖ: последняя дата, где хоть один номер свободен.
// Всё, что дальше горизонта, занятостью НЕ считаем.

const API = 'https://bookonline24.ru/api/v1';
const PROBE_STEP_DAYS = 7;
const DAY_MS = 86_400_000;
const BATCH = 10;

export type KonturRoom = { id: string; name: string; guests: number };
export type KonturOccupancy = { roomId: string; busyNights: string[] };

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

export const fetchKonturRooms = async (slug: string): Promise<KonturRoom[]> => {
    const response = await fetch(`${API}/daily/${slug}/entities`, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Контур entities: ${response.status}`);
    }
    const rows = (await response.json()) as Array<{ id: string; name: string; placesMax?: number }>;
    return rows.map((row) => ({
        id: row.id,
        name: (row.name ?? '').replace(/\.$/, '').trim(),
        guests: row.placesMax ?? 2,
    }));
};

const freeCount = async (slug: string, roomId: string, night: Date): Promise<number | null> => {
    const response = await fetch(`${API}/daily/${slug}/accommodation-prices/all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
            dateFrom: iso(night),
            dateTo: iso(addDays(night, 1)),
            adultsCount: 1,
            children: [],
            roomCategoryId: roomId,
        }),
    });
    if (!response.ok) return null; // дата в прошлом / сбой — не трактуем как занято
    const rows = (await response.json()) as Array<{ availableCount?: number }>;
    return rows.reduce((max, row) => Math.max(max, row.availableCount ?? 0), 0);
};

/** Последняя дата, до которой отель вообще продаётся (грубо, шагом в неделю). */
export const detectSalesHorizon = async (
    slug: string,
    probeRoomId: string,
    maxDays = 365,
): Promise<number> => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    let horizon = 0;
    for (let offset = 1; offset <= maxDays; offset += PROBE_STEP_DAYS) {
        const count = await freeCount(slug, probeRoomId, addDays(today, offset));
        if (count !== null && count > 0) horizon = offset;
    }
    // добираем неделю вперёд, чтобы не обрезать хвост горизонта
    return horizon > 0 ? horizon + PROBE_STEP_DAYS : 0;
};

export const readKonturOccupancy = async (
    slug: string,
    rooms: KonturRoom[],
    horizonDays: number,
): Promise<KonturOccupancy[]> => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const nights: Date[] = [];
    for (let offset = 1; offset <= horizonDays; offset += 1) nights.push(addDays(today, offset));

    const result: KonturOccupancy[] = [];
    for (const room of rooms) {
        const busyNights: string[] = [];
        for (let index = 0; index < nights.length; index += BATCH) {
            const chunk = nights.slice(index, index + BATCH);
            const counts = await Promise.all(
                chunk.map(async (night) => ({ night, count: await freeCount(slug, room.id, night) })),
            );
            for (const { night, count } of counts) {
                if (count === 0) busyNights.push(iso(night));
            }
        }
        result.push({ roomId: room.id, busyNights });
    }
    return result;
};
