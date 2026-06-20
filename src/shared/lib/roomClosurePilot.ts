/** Пилот закрытия дат: только отель «тест». */
export const ROOM_CLOSURE_PILOT_HOTEL_ID = '19ad2328-0b5f-4903-b8fe-8b5f1b279160';

export const isRoomClosurePilotHotel = (hotelId?: string | null) =>
    hotelId === ROOM_CLOSURE_PILOT_HOTEL_ID;
