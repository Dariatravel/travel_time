import type { HotelRoomsReservesDTO } from '@/shared/api/hotel/hotel';
import type { FreeHotelsDTO } from '@/shared/api/hotel/hotel';
import type { ReserveDTO } from '@/shared/api/reserve/reserve';
import supabase from '@/shared/config/supabase';

export const isYandexBackendProxyClientEnabled = () => {
    return process.env.NEXT_PUBLIC_USE_YANDEX_BACKEND_PROXY === 'true';
};

const getAuthorizationHeader = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (token) {
        return `Bearer ${token}`;
    }

    if (typeof window === 'undefined') {
        return undefined;
    }

    for (const key of Object.keys(window.localStorage)) {
        if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) {
            continue;
        }

        try {
            const storedSession = JSON.parse(window.localStorage.getItem(key) ?? 'null');
            const storedToken =
                typeof storedSession?.access_token === 'string'
                    ? storedSession.access_token
                    : typeof storedSession?.currentSession?.access_token === 'string'
                      ? storedSession.currentSession.access_token
                      : undefined;

            if (storedToken) {
                return `Bearer ${storedToken}`;
            }
        } catch {
            // Ignore unrelated localStorage values with a matching key shape.
        }
    }

    return undefined;
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

export const getAvailableHotelsViaYandexBackend = (
    filter: Record<string, unknown>,
) => {
    return fetchBackendJson<FreeHotelsDTO[]>('/api/yandex-backend/hotels/available', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(filter),
    });
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
