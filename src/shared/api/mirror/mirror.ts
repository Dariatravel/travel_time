import { invalidateHotelChessmateQueries } from '@/shared/config/reactQuery';
import supabase from '@/shared/config/supabase';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type MirrorRefreshResult = {
    inserted?: number;
    skipped?: number;
    ourReserves?: number;
    movedBookings?: number;
    /** Медленный отель: запущено фоновое обновление (крон), результат позже. */
    started?: boolean;
};

const getAuthHeaders = async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Автоподтяжка протухших голубых шахматок при подборе (fire-and-forget).
 * Ошибки глотаем: обновление зеркал не должно мешать самому поиску.
 */
export const refreshStaleMirrors = async (): Promise<void> => {
    try {
        await fetch('/api/mirror/refresh-stale', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
            body: JSON.stringify({}),
        });
    } catch {
        // молча — фоновая операция
    }
};

export const refreshMirror = async (hotelId: string): Promise<MirrorRefreshResult> => {
    const response = await fetch('/api/mirror/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ hotelId }),
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.error ?? 'Не удалось обновить занятость');
    }
    return data.result as MirrorRefreshResult;
};

export const useRefreshMirror = (hotelId?: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => {
            if (!hotelId) throw new Error('Не указан отель');
            return refreshMirror(hotelId);
        },
        onSuccess: async (result) => {
            // Медленный отель — крон запущен в фоне, данные появятся позже.
            if (result?.started) {
                showToast(
                    'Обновление запущено — занятость появится через 1–2 минуты. Затем обновите страницу.',
                    'success',
                );
                return;
            }
            if (hotelId) {
                await invalidateHotelChessmateQueries(queryClient, hotelId, {
                    includeHotelList: true,
                });
            }
            showToast(
                `Занятость обновлена: меток ${result?.inserted ?? 0}, переставлено броней ${result?.movedBookings ?? 0}`,
                'success',
            );
        },
        onError: (error: Error) => {
            showToast(error.message || 'Не удалось обновить занятость', 'error');
        },
    });
};
