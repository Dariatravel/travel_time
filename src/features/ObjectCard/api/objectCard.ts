import supabase from '@/shared/config/supabase';
import { invalidateHotelChessmateQueries } from '@/shared/config/reactQuery';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
    cleanInternal,
    cleanPublic,
    emptyPublic,
    type CardInternal,
    type CardPublic,
    type CardRow,
    type Channel,
    type HotelierCardRow,
    type PlacementRow,
    type PlacementStatus,
} from '../lib/objectCard';

export const OBJECT_KEYS = {
    list: ['objects', 'list'] as const,
    card: (hotelId: string) => ['objects', 'card', hotelId] as const,
    placements: (hotelId: string) => ['objects', 'placements', hotelId] as const,
    mine: ['objects', 'mine'] as const,
};

// Таблицы новые и в database.types.ts не описаны — по строковому имени.
const cardsTable = () => supabase.from('hotel_cards');
const placementsTable = () => supabase.from('hotel_placements');

export type HotelListRow = {
    id: string;
    title: string;
    city: string | null;
    address: string | null;
    user_id: string | null;
    is_search_visible: boolean | null;
};

export type ObjectListItem = { hotel: HotelListRow; card: CardRow | null };

/** Все отели с их карточками (у кого нет — null). */
export const useObjectsList = (enabled: boolean) =>
    useQuery({
        queryKey: OBJECT_KEYS.list,
        enabled,
        queryFn: async (): Promise<ObjectListItem[]> => {
            const [hotels, cards] = await Promise.all([
                supabase.from('hotels').select('id, title, city, address, user_id, is_search_visible').order('title').limit(5000),
                cardsTable().select('*').limit(5000),
            ]);
            if (hotels.error) throw hotels.error;
            if (cards.error) throw cards.error;
            const byHotel = new Map(((cards.data ?? []) as CardRow[]).map((c) => [c.hotel_id, c]));

            return ((hotels.data ?? []) as HotelListRow[]).map((hotel) => ({ hotel, card: byHotel.get(hotel.id) ?? null }));
        },
    });

export const useCard = (hotelId: string, enabled: boolean) =>
    useQuery({
        queryKey: OBJECT_KEYS.card(hotelId),
        enabled: enabled && !!hotelId,
        queryFn: async () => {
            const { data, error } = await cardsTable().select('*').eq('hotel_id', hotelId).maybeSingle();
            if (error) throw error;

            return (data as CardRow | null) ?? null;
        },
    });

/** Менеджер сохраняет карточку: публичное и внутреннее одним запросом. */
export const useSaveCard = (hotelId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { publicPart: Partial<CardPublic>; internalPart: Partial<CardInternal>; actor: string }) => {
            const row = {
                hotel_id: hotelId,
                ...emptyPublic(),
                ...cleanPublic(input.publicPart),
                ...cleanInternal(input.internalPart),
                updated_at: new Date().toISOString(),
                updated_by: input.actor,
            };
            const { error } = await cardsTable().upsert(row, { onConflict: 'hotel_id' });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: OBJECT_KEYS.card(hotelId) });
            queryClient.invalidateQueries({ queryKey: OBJECT_KEYS.list });
        },
    });
};

export const usePlacements = (hotelId: string, enabled: boolean) =>
    useQuery({
        queryKey: OBJECT_KEYS.placements(hotelId),
        enabled: enabled && !!hotelId,
        queryFn: async () => {
            const { data, error } = await placementsTable().select('hotel_id, channel, status, url').eq('hotel_id', hotelId);
            if (error) throw error;

            return (data ?? []) as PlacementRow[];
        },
    });

export const useSavePlacement = (hotelId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { channel: Channel; status: PlacementStatus; url: string; actor: string }) => {
            const { error } = await placementsTable().upsert(
                {
                    hotel_id: hotelId,
                    channel: input.channel,
                    status: input.status,
                    url: input.url.trim().slice(0, 500) || null,
                    updated_at: new Date().toISOString(),
                    updated_by: input.actor,
                },
                { onConflict: 'hotel_id,channel' },
            );
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: OBJECT_KEYS.placements(hotelId) }),
    });
};

/**
 * Подтвердить или отклонить правку отельера — функции базы, только admin.
 * При подтверждении передаётся время правки, которую менеджер видел: если
 * отельер успел прислать новую, база вернёт 0 и ничего не перенесёт.
 */
export const useReviewDraft = (hotelId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { decision: 'approve' | 'reject'; draftAt: string | null }) => {
            const { data, error } =
                input.decision === 'approve'
                    ? await supabase.rpc('approve_card_draft', { p_hotel: hotelId, p_draft_at: input.draftAt })
                    : await supabase.rpc('reject_card_draft', { p_hotel: hotelId });
            if (error) throw error;

            return (data as number | null) ?? 0;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: OBJECT_KEYS.card(hotelId) });
            queryClient.invalidateQueries({ queryKey: OBJECT_KEYS.list });
        },
    });
};

/** Привязать существующего пользователя к отелю (или отвязать — null). */
export const useSetHotelOwner = (hotelId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (userId: string | null) => {
            const { error } = await supabase.from('hotels').update({ user_id: userId }).eq('id', hotelId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: OBJECT_KEYS.list });
            void invalidateHotelChessmateQueries(queryClient, hotelId, { includeHotelList: true });
        },
    });
};

const authHeaders = async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    return token ? { Authorization: `Bearer ${token}` } : {};
};

export type InvitePayload = {
    email: string;
    password: string;
    name: string;
    phone: string;
    hotel_id: string;
    /** У отеля уже есть отельер — заменить его (осознанно, после подтверждения). */
    replace?: boolean;
};

/** Создать вход отельеру и привязать к отелю — серверный роут, только admin. */
export const useInviteHotelier = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: InvitePayload) => {
            const response = await fetch('/api/admin/hoteliers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
                body: JSON.stringify(payload),
            });
            const data = (await response.json()) as { error?: string; hotelier?: { id: string; email: string } };
            if (!response.ok) throw new Error(data.error ?? 'Не удалось создать доступ');

            return data.hotelier!;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: OBJECT_KEYS.list });
            queryClient.invalidateQueries({ queryKey: ['USERS', 'list'] });
        },
    });
};

/** Отели отельера с публичной частью карточки — функция базы. */
export const useMyHotels = (enabled: boolean) =>
    useQuery({
        queryKey: OBJECT_KEYS.mine,
        enabled,
        queryFn: async () => {
            const { data, error } = await supabase.rpc('hotelier_cards');
            if (error) throw error;

            return (data ?? []) as HotelierCardRow[];
        },
    });

/**
 * Отельер отправляет правку на проверку — только изменённые поля, иначе
 * подтверждение перезаписало бы то, что менеджер поправил позже сам.
 * Возвращает число принятых полей.
 */
export const useSubmitDraft = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { hotelId: string; draft: Partial<CardPublic> }) => {
            const { data, error } = await supabase.rpc('hotelier_submit_card', {
                p_hotel: input.hotelId,
                p_draft: cleanPublic(input.draft),
            });
            if (error) throw error;

            return (data as number | null) ?? 0;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: OBJECT_KEYS.mine }),
    });
};

/** Отельер отзывает свою правку, пока её не проверили. */
export const useWithdrawDraft = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (hotelId: string) => {
            const { data, error } = await supabase.rpc('hotelier_withdraw_card', { p_hotel: hotelId });
            if (error) throw error;

            return (data as number | null) ?? 0;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: OBJECT_KEYS.mine }),
    });
};
