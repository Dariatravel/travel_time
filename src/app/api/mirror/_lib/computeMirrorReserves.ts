// Логика голубой шахматки v1: наши брони остаются как есть (и номер, и даты),
// а внешняя занятость по категории «занято N из M» дописывается метками
// «Занято» на свободные номера, пока по каждому дню занятость не совпадёт с N.
// Метки пакуются на нижние свободные номера. Даты наших броней не меняются.

import { toMoscowStayUnix } from '@/app/api/realtycalendar/_lib/moscowTime';

import type { CategoryOccupancy } from './shelterFrontdesk';

const NIGHT = 86400;

export type OurReserve = { room_id: string; start: number; end: number };
export type MirrorMarker = { roomId: string; start: number; end: number };

const dateOfNight = (night: number) => {
    const date = new Date(night * NIGHT * 1000);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};

// Метка на ночи [firstNight..lastNight] → заезд 14:00 первого дня, выезд 12:00
// дня после последней ночи (московская конвенция, как у всех броней).
const markerStart = (firstNight: number) => {
    const { year, month, day } = dateOfNight(firstNight);
    return toMoscowStayUnix(year, month, day, false);
};
const markerEnd = (lastNight: number) => {
    const { year, month, day } = dateOfNight(lastNight + 1);
    return toMoscowStayUnix(year, month, day, true);
};

export const computeMirrorMarkers = (
    categories: Array<{ roomIds: string[]; occupancy: CategoryOccupancy }>,
    ourReserves: OurReserve[],
): MirrorMarker[] => {
    const markers: MirrorMarker[] = [];

    for (const { roomIds, occupancy } of categories) {
        const totalRooms = roomIds.length;

        // Наши занятые ночи по каждому номеру.
        const ourNights = new Map<string, Set<number>>();
        for (const roomId of roomIds) ourNights.set(roomId, new Set());
        for (const reserve of ourReserves) {
            const nights = ourNights.get(reserve.room_id);
            if (!nights) continue;
            const from = Math.floor(reserve.start / NIGHT);
            const to = Math.floor(reserve.end / NIGHT);
            for (let night = from; night < to; night += 1) nights.add(night);
        }

        // Раскладываем недостающие метки по свободным номерам, пакуя на нижние.
        const markerNights = new Map<string, Set<number>>();
        for (const roomId of roomIds) markerNights.set(roomId, new Set());

        for (const [night, occupied] of occupancy.occupiedByNight) {
            const target = Math.min(totalRooms, occupied);
            const ourHere = roomIds.filter((roomId) => ourNights.get(roomId)!.has(night)).length;
            let need = Math.max(0, target - ourHere);
            for (const roomId of roomIds) {
                if (need <= 0) break;
                if (ourNights.get(roomId)!.has(night)) continue;
                markerNights.get(roomId)!.add(night);
                need -= 1;
            }
        }

        // Схлопываем подряд идущие ночи каждого номера в интервалы.
        for (const roomId of roomIds) {
            const nights = [...markerNights.get(roomId)!].sort((left, right) => left - right);
            let index = 0;
            while (index < nights.length) {
                let end = index;
                while (end + 1 < nights.length && nights[end + 1] === nights[end] + 1) end += 1;
                markers.push({
                    roomId,
                    start: markerStart(nights[index]),
                    end: markerEnd(nights[end]),
                });
                index = end + 1;
            }
        }
    }

    return markers;
};
