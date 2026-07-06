import { ReserveDTO } from '@/shared/api/reserve/reserve';
import { RoomDTO, RoomReserves } from '@/shared/api/room/room';

export const TRIAL_HOTEL_TITLE = 'ПРОБНЫЙ';

export type TrialRoomCategory = 'comfort' | 'comfortPlus' | 'semiLux' | 'vip';

type RoomLike = Pick<RoomDTO, 'id' | 'title'>;
type ReserveLike = Pick<ReserveDTO, 'id' | 'room_id' | 'start' | 'end'> & {
    is_fixed?: boolean | null;
};

type Placement = {
    reserve: ReserveLike;
    roomId: string;
    start: number;
    end: number;
};

type PlacementCandidate = {
    roomId: string;
    compactPenalty: number;
    largestWindow: number;
    sameRoomPenalty: number;
    roomOrder: number;
};

const DAY_SECONDS = 24 * 60 * 60;

const normalizeTitle = (title?: string | null) => (title ?? '').toLocaleLowerCase('ru-RU');

const toUnix = (value: ReserveDTO['start']) =>
    typeof value === 'number' ? value : Math.floor(value.getTime() / 1000);

const getGapDays = (leftEnd: number, rightStart: number) =>
    Math.max(0, Math.round((rightStart - leftEnd) / DAY_SECONDS));

export const isTrialHotelTitle = (title?: string | null) =>
    normalizeTitle(title).trim() === normalizeTitle(TRIAL_HOTEL_TITLE).trim();

export const getTrialRoomCategory = (roomTitle?: string | null): TrialRoomCategory | null => {
    const title = normalizeTitle(roomTitle);

    if (!title) return null;
    if (title.includes('вип')) return 'vip';
    if (title.includes('полулюкс')) return 'semiLux';
    if (title.includes('комфорт') && title.includes('+')) return 'comfortPlus';
    if (title.includes('комфорт')) return 'comfort';

    return null;
};

export const getTrialRoomCategoryLabel = (category: TrialRoomCategory | null) => {
    switch (category) {
        case 'comfort':
            return 'Комфорт';
        case 'comfortPlus':
            return 'Комфорт +';
        case 'semiLux':
            return 'Полулюкс';
        case 'vip':
            return 'ВИП';
        default:
            return 'Без категории';
    }
};

export const isTrialVipRoom = (roomTitle?: string | null) =>
    getTrialRoomCategory(roomTitle) === 'vip';

export const isTrialReserveFixed = (
    reserve: { is_fixed?: boolean | null },
    room?: { title?: string | null } | null,
) => Boolean(reserve.is_fixed) || isTrialVipRoom(room?.title);

export const canMoveWithinTrialCategory = (
    fromRoom?: { title?: string | null } | null,
    toRoom?: { title?: string | null } | null,
) => {
    const fromCategory = getTrialRoomCategory(fromRoom?.title);
    const toCategory = getTrialRoomCategory(toRoom?.title);

    return Boolean(fromCategory && toCategory && fromCategory === toCategory);
};

const hasOverlap = (placements: Placement[], reserve: ReserveLike, roomId: string) => {
    const start = toUnix(reserve.start);
    const end = toUnix(reserve.end);

    return placements.some(
        (placement) =>
            placement.roomId === roomId &&
            placement.reserve.id !== reserve.id &&
            start < placement.end &&
            placement.start < end,
    );
};

const getCompactPenalty = (roomPlacements: Placement[], reserve: ReserveLike) => {
    const start = toUnix(reserve.start);
    const end = toUnix(reserve.end);
    const sorted = [...roomPlacements].sort((left, right) => left.start - right.start);
    const previous = [...sorted].reverse().find((placement) => placement.end <= start);
    const next = sorted.find((placement) => placement.start >= end);
    const gaps = [
        previous ? getGapDays(previous.end, start) : Number.POSITIVE_INFINITY,
        next ? getGapDays(end, next.start) : Number.POSITIVE_INFINITY,
    ];
    const nearestGap = Math.min(...gaps);

    if (!Number.isFinite(nearestGap)) return 9999;
    if (nearestGap <= 1) return 0;

    return nearestGap;
};

const getLargestWindowAfterPlacement = (
    placements: Placement[],
    reserve: ReserveLike,
    roomId: string,
    categoryRoomIds: string[],
) => {
    const nextPlacement: Placement = {
        reserve,
        roomId,
        start: toUnix(reserve.start),
        end: toUnix(reserve.end),
    };
    const allPlacements = [...placements, nextPlacement];
    const horizonStart = Math.min(...allPlacements.map((placement) => placement.start));
    const horizonEnd = Math.max(...allPlacements.map((placement) => placement.end));

    return categoryRoomIds.reduce((largestWindow, currentRoomId) => {
        const roomPlacements = allPlacements
            .filter((placement) => placement.roomId === currentRoomId)
            .sort((left, right) => left.start - right.start);
        let previousEnd = horizonStart;
        let roomLargestWindow = 0;

        roomPlacements.forEach((placement) => {
            roomLargestWindow = Math.max(roomLargestWindow, placement.start - previousEnd);
            previousEnd = Math.max(previousEnd, placement.end);
        });

        roomLargestWindow = Math.max(roomLargestWindow, horizonEnd - previousEnd);

        return Math.max(largestWindow, roomLargestWindow);
    }, 0);
};

const compareCandidates = (left: PlacementCandidate, right: PlacementCandidate) => {
    if (left.compactPenalty !== right.compactPenalty) {
        return left.compactPenalty - right.compactPenalty;
    }

    if (left.largestWindow !== right.largestWindow) {
        return right.largestWindow - left.largestWindow;
    }

    if (left.sameRoomPenalty !== right.sameRoomPenalty) {
        return left.sameRoomPenalty - right.sameRoomPenalty;
    }

    return left.roomOrder - right.roomOrder;
};

export const buildTrialCategoryReserveUpdates = ({
    rooms,
    reserves,
    category,
}: {
    rooms: RoomLike[];
    reserves: ReserveLike[];
    category: TrialRoomCategory;
}): Array<Pick<ReserveDTO, 'id' | 'room_id'>> => {
    const categoryRooms = rooms.filter((room) => getTrialRoomCategory(room.title) === category);
    const categoryRoomIds = categoryRooms.map((room) => room.id);
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const roomOrderById = new Map(categoryRoomIds.map((roomId, index) => [roomId, index]));
    const categoryReserves = reserves.filter((reserve) => categoryRoomIds.includes(reserve.room_id));
    const fixedPlacements: Placement[] = categoryReserves
        .filter((reserve) => isTrialReserveFixed(reserve, roomById.get(reserve.room_id)))
        .map((reserve) => ({
            reserve,
            roomId: reserve.room_id,
            start: toUnix(reserve.start),
            end: toUnix(reserve.end),
        }));
    const movableReserves = categoryReserves
        .filter((reserve) => !isTrialReserveFixed(reserve, roomById.get(reserve.room_id)))
        .sort((left, right) => {
            const startDiff = toUnix(left.start) - toUnix(right.start);
            if (startDiff !== 0) return startDiff;

            return toUnix(right.end) - toUnix(right.start) - (toUnix(left.end) - toUnix(left.start));
        });
    const placements = [...fixedPlacements];
    const updates: Array<Pick<ReserveDTO, 'id' | 'room_id'>> = [];

    movableReserves.forEach((reserve) => {
        const candidates = categoryRoomIds
            .filter((roomId) => !hasOverlap(placements, reserve, roomId))
            .map((roomId): PlacementCandidate => {
                const roomPlacements = placements.filter((placement) => placement.roomId === roomId);

                return {
                    roomId,
                    compactPenalty: getCompactPenalty(roomPlacements, reserve),
                    largestWindow: getLargestWindowAfterPlacement(
                        placements,
                        reserve,
                        roomId,
                        categoryRoomIds,
                    ),
                    sameRoomPenalty: roomId === reserve.room_id ? 0 : 1,
                    roomOrder: roomOrderById.get(roomId) ?? 9999,
                };
            })
            .sort(compareCandidates);

        const bestCandidate = candidates[0];
        const nextRoomId = bestCandidate?.roomId ?? reserve.room_id;

        placements.push({
            reserve,
            roomId: nextRoomId,
            start: toUnix(reserve.start),
            end: toUnix(reserve.end),
        });

        if (nextRoomId !== reserve.room_id) {
            updates.push({ id: reserve.id, room_id: nextRoomId });
        }
    });

    return updates;
};

export const getTrialCategoryForReserveRoom = (
    rooms: RoomLike[],
    roomId?: string | null,
) => getTrialRoomCategory(rooms.find((room) => room.id === roomId)?.title);

export const flattenRoomReserves = (rooms: RoomReserves[] = []): ReserveDTO[] =>
    rooms.flatMap((room) =>
        (room.reserves ?? []).map((reserve) => ({
            ...reserve,
            room_id: reserve.room_id || room.id,
        })),
    );
