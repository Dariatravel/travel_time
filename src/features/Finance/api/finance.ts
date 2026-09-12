import supabase from '@/shared/config/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AdjustmentRow, FinanceReserve, HotelTermsRow, PayoutRow } from '../lib/finance';

const DAY = 86400;

export const FINANCE_KEYS = {
    reserves: (fromDay: number, toDay: number) => ['finance', 'reserves', fromDay, toDay] as const,
    terms: ['finance', 'terms'] as const,
    payouts: ['finance', 'payouts'] as const,
    adjustments: ['finance', 'adjustments'] as const,
    details: (hotelId: string) => ['finance', 'details', hotelId] as const,
};

// Таблицы новые и в database.types.ts не описаны — по строковому имени.
const termsTable = () => supabase.from('hotel_terms');
const detailsTable = () => supabase.from('hotel_payment_details');
const payoutsTable = () => supabase.from('payouts');
const adjustmentsTable = () => supabase.from('finance_adjustments');

/** Брони с выездом в периоде (по московским суткам; края с запасом в день). */
export const useFinanceReserves = (fromDay: number, toDay: number) =>
    useQuery({
        queryKey: FINANCE_KEYS.reserves(fromDay, toDay),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('reserves')
                .select('id, guest, start, end, price, quantity, prepayment, external_source, rooms(id, title, hotels(id, title)), booking_cards(status)')
                .gte('end', (fromDay - 1) * DAY)
                .lte('end', (toDay + 2) * DAY)
                .order('end', { ascending: true })
                .limit(3000);
            if (error) throw error;

            return (data ?? []) as unknown as FinanceReserve[];
        },
    });

export const useHotelTerms = () =>
    useQuery({
        queryKey: FINANCE_KEYS.terms,
        queryFn: async () => {
            const { data, error } = await termsTable().select('*');
            if (error) throw error;

            return (data ?? []) as HotelTermsRow[];
        },
    });

export const usePayouts = () =>
    useQuery({
        queryKey: FINANCE_KEYS.payouts,
        queryFn: async () => {
            const { data, error } = await payoutsTable().select('*').order('paid_at', { ascending: false }).limit(2000);
            if (error) throw error;

            return (data ?? []) as PayoutRow[];
        },
    });

export const useAdjustments = () =>
    useQuery({
        queryKey: FINANCE_KEYS.adjustments,
        queryFn: async () => {
            const { data, error } = await adjustmentsTable().select('*').order('date', { ascending: false }).limit(2000);
            if (error) throw error;

            return (data ?? []) as AdjustmentRow[];
        },
    });

export type PaymentDetails = { hotel_id: string; bank: string | null; holder: string | null; requisites: string | null };

export const usePaymentDetails = (hotelId?: string) =>
    useQuery({
        queryKey: FINANCE_KEYS.details(hotelId ?? ''),
        enabled: !!hotelId,
        queryFn: async () => {
            const { data, error } = await detailsTable().select('*').eq('hotel_id', hotelId).maybeSingle();
            if (error) throw error;

            return (data ?? null) as PaymentDetails | null;
        },
    });

const useInvalidate = () => {
    const queryClient = useQueryClient();

    return () => queryClient.invalidateQueries({ queryKey: ['finance'] });
};

export const useSaveTerms = () => {
    const invalidate = useInvalidate();

    return useMutation({
        mutationFn: async (input: { terms: Omit<HotelTermsRow, 'updated_at' | 'updated_by'>; details: Omit<PaymentDetails, 'hotel_id'>; actor: string }) => {
            const now = new Date().toISOString();
            const { error } = await termsTable().upsert({ ...input.terms, updated_at: now, updated_by: input.actor }, { onConflict: 'hotel_id' });
            if (error) throw error;
            const { error: detailsError } = await detailsTable().upsert(
                { hotel_id: input.terms.hotel_id, ...input.details, updated_at: now, updated_by: input.actor },
                { onConflict: 'hotel_id' },
            );
            if (detailsError) throw detailsError;
        },
        onSuccess: () => invalidate(),
    });
};

export const useAddPayout = () => {
    const invalidate = useInvalidate();

    return useMutation({
        mutationFn: async (input: Omit<PayoutRow, 'id' | 'created_at'>) => {
            const { error } = await payoutsTable().insert(input);
            if (error) throw error;
        },
        onSuccess: () => invalidate(),
    });
};

export const useAddAdjustment = () => {
    const invalidate = useInvalidate();

    return useMutation({
        mutationFn: async (input: Omit<AdjustmentRow, 'id' | 'created_at'>) => {
            const { error } = await adjustmentsTable().insert(input);
            if (error) throw error;
        },
        onSuccess: () => invalidate(),
    });
};

export const useDeleteFinanceRow = () => {
    const invalidate = useInvalidate();

    return useMutation({
        mutationFn: async (input: { table: 'payouts' | 'finance_adjustments'; id: string }) => {
            const { error } = await supabase.from(input.table).delete().eq('id', input.id);
            if (error) throw error;
        },
        onSuccess: () => invalidate(),
    });
};
