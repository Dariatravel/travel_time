import { REALTYCALENDAR_ROOM_TO_TRAVEL_ROOM } from '@/app/api/realtycalendar/_lib/roomMapping';

export type IcalSyncFeed = {
    roomId: string;
    url: string;
};

const ICAL_EXPORT_BASE = 'https://realtycalendar.ru/apartments/export.ics?r=';

export const buildRealtyCalendarIcalUrl = (realtyCalendarRoomId: string) => {
    const encodedRoomId = Buffer.from(realtyCalendarRoomId, 'utf8').toString('base64');
    return `${ICAL_EXPORT_BASE}${encodedRoomId}`;
};

export const getRealtyCalendarIcalFeeds = (): IcalSyncFeed[] => {
    return Object.entries(REALTYCALENDAR_ROOM_TO_TRAVEL_ROOM).map(([realtyCalendarRoomId, roomId]) => ({
        roomId,
        url: buildRealtyCalendarIcalUrl(realtyCalendarRoomId),
    }));
};
