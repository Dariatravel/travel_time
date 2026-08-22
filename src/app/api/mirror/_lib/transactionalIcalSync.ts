export const TRANSACTIONAL_ICAL_SYNC_ENV = 'TRANSACTIONAL_ICAL_SYNC_ENABLED';

export const isTransactionalIcalSyncEnabled = (
    value = process.env[TRANSACTIONAL_ICAL_SYNC_ENV],
): boolean => value?.trim().toLowerCase() !== 'false';

export type IcalSyncMarker = {
    roomId: string;
    start: number;
    end: number;
    icalId: number;
};

export const toExternalOccupancyMarks = (
    markers: IcalSyncMarker[],
    source: { tag: string; guest: string },
    comment: string,
) =>
    markers.map((marker) => ({
        room_id: marker.roomId,
        start_at: marker.start,
        end_at: marker.end,
        guest: source.guest,
        comment,
        external_uid: `${source.tag}:${marker.roomId}:${marker.start}-${marker.end}`,
        external_feed_url: `https://public-api.reservationsteps.ru/v1/api/ical/${marker.icalId}`,
    }));
