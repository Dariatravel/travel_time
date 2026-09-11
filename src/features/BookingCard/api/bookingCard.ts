import supabase from '@/shared/config/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BookingCardRow, BookingStatus } from '../lib/voucher';

export type BookingCardEvent = {
    id: number;
    reserve_id: string;
    event: string;
    details: Record<string, unknown> | null;
    created_at: string;
    created_by: string | null;
};

export const BOOKING_CARD_KEYS = {
    card: (reserveId: string) => ['booking-card', reserveId] as const,
    events: (reserveId: string) => ['booking-card', reserveId, 'events'] as const,
    list: ['booking-cards', 'list'] as const,
};

// Таблицы новые и в database.types.ts не описаны — обращение по строковому
// имени, как в HotelSurvey.
const cardsTable = () => supabase.from('booking_cards');
const eventsTable = () => supabase.from('booking_card_events');

const authHeaders = async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const useBookingCard = (reserveId?: string, enabled = true) =>
    useQuery({
        queryKey: BOOKING_CARD_KEYS.card(reserveId ?? ''),
        enabled: !!reserveId && enabled,
        queryFn: async () => {
            const { data, error } = await cardsTable()
                .select('*')
                .eq('reserve_id', reserveId)
                .maybeSingle();
            if (error) throw error;

            return (data ?? null) as BookingCardRow | null;
        },
    });

export const useBookingCardEvents = (reserveId?: string, enabled = true) =>
    useQuery({
        queryKey: BOOKING_CARD_KEYS.events(reserveId ?? ''),
        enabled: !!reserveId && enabled,
        queryFn: async () => {
            const { data, error } = await eventsTable()
                .select('*')
                .eq('reserve_id', reserveId)
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw error;

            return (data ?? []) as BookingCardEvent[];
        },
    });

export type BookingCardPatch = Partial<
    Pick<
        BookingCardRow,
        | 'status'
        | 'source'
        | 'manager'
        | 'voucher_kind'
        | 'payment_bank'
        | 'payment_date'
        | 'payment_phone'
        | 'service_note'
        | 'voucher_generated_at'
        | 'chat_sent_at'
        | 'hotel_notified_at'
        | 'client_sent_at'
    >
>;

const invalidateCard = (queryClient: ReturnType<typeof useQueryClient>, reserveId: string) =>
    Promise.all([
        queryClient.invalidateQueries({ queryKey: BOOKING_CARD_KEYS.card(reserveId) }),
        queryClient.invalidateQueries({ queryKey: BOOKING_CARD_KEYS.events(reserveId) }),
        queryClient.invalidateQueries({ queryKey: BOOKING_CARD_KEYS.list }),
    ]);

/** Сохранить поля карточки (upsert) и, если нужно, записать событие в ленту. */
export const useSaveBookingCard = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: {
            reserveId: string;
            patch: BookingCardPatch;
            actor: string;
            event?: { event: string; details?: Record<string, unknown> };
        }) => {
            const now = new Date().toISOString();
            const { error } = await cardsTable().upsert(
                { reserve_id: input.reserveId, ...input.patch, updated_at: now, updated_by: input.actor },
                { onConflict: 'reserve_id' },
            );
            if (error) throw error;

            if (input.event) {
                const { error: eventError } = await eventsTable().insert({
                    reserve_id: input.reserveId,
                    event: input.event.event,
                    details: input.event.details ?? null,
                    created_by: input.actor,
                });
                if (eventError) throw eventError;
            }
        },
        onSuccess: (_result, input) => invalidateCard(queryClient, input.reserveId),
    });
};

export type SendToChatInput = {
    reserveId: string;
    kind: 'booking' | 'cancel' | 'transfer' | 'change';
    caption: string;
    file?: { blob: Blob; name: string } | null;
};

export type SendToChatResult = { ok: true; delivery: 'direct' | 'github' | 'text'; sentAt: string };

/** Отправка в чат «Королева Абхазии» — через серверный роут, только по клику. */
export const useSendToChat = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: SendToChatInput): Promise<SendToChatResult> => {
            const form = new FormData();
            form.append('reserveId', input.reserveId);
            form.append('kind', input.kind);
            form.append('caption', input.caption);
            if (input.file) form.append('file', input.file.blob, input.file.name);

            const response = await fetch('/api/booking-card/send', {
                method: 'POST',
                headers: await authHeaders(),
                body: form,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error ?? `HTTP ${response.status}`);
            }

            return payload as SendToChatResult;
        },
        onSuccess: (_result, input) => invalidateCard(queryClient, input.reserveId),
    });
};

/** Строка списка на странице «Брони»: бронь + отель + карточка (если есть). */
export type BookingListRow = {
    id: string;
    guest: string;
    phone: string;
    start: number;
    end: number;
    price: number;
    quantity: number;
    prepayment: string | number | null;
    comment: string | null;
    created_at: string | null;
    external_source: string | null;
    rooms: {
        id: string;
        title: string;
        hotels: {
            id: string;
            title: string;
            type: string | null;
            address: string | null;
            phone: string | null;
        } | null;
    } | null;
    booking_cards: BookingCardRow[] | BookingCardRow | null;
};

export const cardOfRow = (row: BookingListRow): BookingCardRow | null => {
    const value = row.booking_cards;
    if (!value) return null;

    return Array.isArray(value) ? (value[0] ?? null) : value;
};

/** Брони с заездом от указанного дня (unix) — своими руками созданные, не внешние. */
export const useBookingList = (
    fromUnix: number,
    status?: BookingStatus | 'all',
    enabled = true,
) =>
    useQuery({
        queryKey: [...BOOKING_CARD_KEYS.list, fromUnix, status ?? 'all'],
        enabled,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('reserves')
                .select(
                    'id, guest, phone, start, end, price, quantity, prepayment, comment, created_at, external_source, rooms(id, title, hotels(id, title, type, address, phone)), booking_cards(*)',
                )
                .gte('start', fromUnix)
                .is('external_source', null)
                .order('start', { ascending: true })
                .limit(500);
            if (error) throw error;

            const rows = (data ?? []) as unknown as BookingListRow[];
            if (!status || status === 'all') return rows;

            return rows.filter((row) => (cardOfRow(row)?.status ?? 'booked') === status);
        },
    });
