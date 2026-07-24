import { invalidateHotelChessmateQueries } from '@/shared/config/reactQuery';
import supabase from '@/shared/config/supabase';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type MirrorRefreshResult = {
    inserted?: number;
    skipped?: number;
    ourReserves?: number;
};

const getAuthHeaders = async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
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
            if (hotelId) {
                await invalidateHotelChessmateQueries(queryClient, hotelId, {
                    includeHotelList: true,
                });
            }
            showToast(`Занятость обновлена (добавлено меток: ${result?.inserted ?? 0})`, 'success');
        },
        onError: (error: Error) => {
            showToast(error.message || 'Не удалось обновить занятость', 'error');
        },
    });
};
