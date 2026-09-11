import supabase from '@/shared/config/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { MorningReserve, TouchpointKind, TouchpointRow, TouchpointStatus } from '../lib/morning';

const DAY = 86400;
/**
 * Окно выборки. Отзыв просят через 7 дней после выезда, проверяют ещё через 2,
 * «позже» +3, переносы — не больше 14 дней просрочки; 90 дней назад хватает
 * с запасом, дальше открытых задач быть не может.
 */
const PAST_DAYS = 90;
const FUTURE_DAYS = 14;
/** При таком числе строк выборка обрезана — экран покажет предупреждение. */
export const MORNING_ROW_LIMIT = 1500;

export const MORNING_KEYS = {
    reserves: ['morning', 'reserves'] as const,
    templates: ['morning', 'templates'] as const,
};

export type MessageTemplate = {
    key: string;
    title: string;
    body: string;
    updated_at?: string;
    updated_by?: string | null;
};

// Таблицы новые и в database.types.ts не описаны — по строковому имени.
const touchpointsTable = () => supabase.from('guest_touchpoints');
const templatesTable = () => supabase.from('message_templates');

/** Брони окна «−45 … +14 дней» с карточками и отметками касаний. */
export const useMorningReserves = (nowUnix: number | null) =>
    useQuery({
        queryKey: [...MORNING_KEYS.reserves, nowUnix],
        enabled: nowUnix !== null,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const now = nowUnix ?? 0;
            const { data, error } = await supabase
                .from('reserves')
                .select(
                    'id, guest, phone, start, end, price, quantity, prepayment, comment, created_at, external_source, rooms(id, title, hotels(id, title, address, phone)), booking_cards(status, hotel_notified_at, manager, source), guest_touchpoints(*)',
                )
                .gte('end', now - PAST_DAYS * DAY)
                .lte('start', now + FUTURE_DAYS * DAY)
                .order('start', { ascending: true })
                .limit(MORNING_ROW_LIMIT);
            if (error) throw error;

            return (data ?? []) as unknown as MorningReserve[];
        },
    });

export const useMessageTemplates = () =>
    useQuery({
        queryKey: MORNING_KEYS.templates,
        queryFn: async () => {
            const { data, error } = await templatesTable().select('*').order('key');
            if (error) throw error;

            return (data ?? []) as MessageTemplate[];
        },
    });

/** Отметка по задаче: upsert одной строки (reserve_id, kind). */
export const useMarkTouchpoint = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: {
            reserveId: string;
            kind: TouchpointKind;
            patch: Partial<TouchpointRow> & { status: TouchpointStatus };
        }) => {
            const { error } = await touchpointsTable().upsert(
                {
                    reserve_id: input.reserveId,
                    kind: input.kind,
                    ...input.patch,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'reserve_id,kind' },
            );
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: MORNING_KEYS.reserves }),
    });
};

export const useSaveTemplate = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { key: string; title: string; body: string; actor: string }) => {
            const { error } = await templatesTable().upsert(
                {
                    key: input.key,
                    title: input.title,
                    body: input.body,
                    updated_at: new Date().toISOString(),
                    updated_by: input.actor,
                },
                { onConflict: 'key' },
            );
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: MORNING_KEYS.templates }),
    });
};
