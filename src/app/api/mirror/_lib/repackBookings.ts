// v2 голубых шахматок: «упаковка вниз» наших броней по строкам-номерам.
// ДАТЫ НЕ МЕНЯЮТСЯ НИКОГДА — двигается только номер (room_id). Каждая бронь
// съезжает в НИЖНИЙ номер, только если он полностью свободен на её даты
// (никаких свопов) — поэтому применение никогда не конфликтует с А1.
// Возвращаем последовательность переездов: применяя её в этом же порядке
// (после удаления внешних меток), каждый переезд идёт в свободную строку.

const NIGHT = 86400;

export type RepackBooking = { id: string; roomId: string; start: number; end: number };
export type RepackMove = { id: string; fromRoomId: string; toRoomId: string };

type State = { id: string; room: number; from: number; to: number };

const overlaps = (a: State, b: State) => a.from < b.to && b.from < a.to;

export const computePullDownRepack = (
    roomIds: string[],
    bookings: RepackBooking[],
): { moves: RepackMove[]; finalRoomById: Map<string, string> } => {
    const indexByRoom = new Map(roomIds.map((roomId, index) => [roomId, index]));

    const state: State[] = bookings.map((booking) => ({
        id: booking.id,
        room: indexByRoom.get(booking.roomId) ?? 0,
        from: Math.floor(booking.start / NIGHT),
        to: Math.floor(booking.end / NIGHT), // конец — исключительно
    }));

    const moves: RepackMove[] = [];

    let changed = true;
    // Каждый проход опускает брони; индекс номера только уменьшается → сходится.
    while (changed) {
        changed = false;
        state.sort((left, right) => left.room - right.room || left.from - right.from);

        for (const booking of state) {
            for (let target = 0; target < booking.room; target += 1) {
                const conflict = state.some(
                    (other) => other !== booking && other.room === target && overlaps(other, booking),
                );
                if (!conflict) {
                    moves.push({
                        id: booking.id,
                        fromRoomId: roomIds[booking.room],
                        toRoomId: roomIds[target],
                    });
                    booking.room = target;
                    changed = true;
                    break;
                }
            }
        }
    }

    const finalRoomById = new Map(state.map((booking) => [booking.id, roomIds[booking.room]]));
    return { moves, finalRoomById };
};
