import type { HotelRoomsReservesDTO } from '@/shared/api/hotel/hotel';
import type { ReserveDTO } from '@/shared/api/reserve/reserve';
import supabase from '@/shared/config/supabase';

export const isYandexBackendProxyClientEnabled = () => {
    return process.env.NEXT_PUBLIC_USE_YANDEX_BACKEND_PROXY === 'true';
};

const getAuthorizationHeader = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    return token ? `Bearer ${token}` : undefined;
};

const fetchBackendJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const authorization = await getAuthorizationHeader();

    const response = await fetch(path, {
        ...init,
        headers: {
            ...(init?.headers ?? {}),
            ...(authorization ? { Authorization: authorization } : {}),
        },
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `Yandex backend proxy failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
};

export const getHotelCalendarViaYandexBackend = (
    hotelId: string,
    allowedRooms?: string[],
) => {
    const params = new URLSearchParams();
    if (allowedRooms) {
        params.set('allowedRooms', allowedRooms.join(','));
    }

    const query = params.toString();
    return fetchBackendJson<HotelRoomsReservesDTO>(
        `/api/yandex-backend/hotels/${hotelId}/calendar${query ? `?${query}` : ''}`,
    );
};

export const updateReserveViaYandexBackend = (reserve: ReserveDTO) => {
    return fetchBackendJson<{ data: Pick<ReserveDTO, 'id' | 'room_id'>; queued: boolean }>(
        `/api/yandex-backend/reserves/${reserve.id}`,
        {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': `${reserve.id}:${reserve.edited_at ?? Date.now()}`,
            },
            body: JSON.stringify(reserve),
        },
    );
};
