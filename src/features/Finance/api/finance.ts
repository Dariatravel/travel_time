import supabase from '@/shared/config/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { dayFromIsoDate, isoDateFromDay, type AdjustmentRow, type FinanceReserve, type HotelRef, type HotelTermsRow, type PayoutRow } from '../lib/finance';

const DAY = 86400;
export const DEFAULT_ACCOUNTING_START = '2026-09-14';

export const FINANCE_KEYS = {
    settings: ['finance', 'settings'] as const,
    reserves: (startDay: number, toDay: number) => ['finance', 'reserves', startDay, toDay] as const,
    hotels: ['finance', 'hotels'] as const,
    terms: ['finance', 'terms'] as const,
    payouts: (startDay: number, toDay: number) => ['finance', 'payouts', startDay, toDay] as const,
    adjustments: (startDay: number, toDay: number) => ['finance', 'adjustments', startDay, toDay] as const,
    details: (hotelId: string) => ['finance', 'details', hotelId] as const,
};

// Таблицы новые и в database.types.ts не описаны — по строковому имени.
const settingsTable = () => supabase.from('finance_settings');
const termsTable = () => supabase.from('hotel_terms');
const detailsTable = () => supabase.from('hotel_payment_details');
const payoutsTable = () => supabase.from('hotel_payouts');
const adjustmentsTable = () => supabase.from('finance_adjustments');

/** Дата начала учёта (до неё всё закрыто руками в OKO). */
export const useAccountingStart = () =>
    useQuery({
        queryKey: FINANCE_KEYS.settings,
        queryFn: async () => {
            const { data, error } = await settingsTable().select('value').eq('key', 'accounting_start').maybeSingle();
            if (error) throw error;
            const value = (data as { value?: string } | null)?.value;

            return dayFromIsoDate(value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value : DEFAULT_ACCOUNTING_START);
        },
    });

export const useSaveAccountingStart = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { day: number; actor: string }) => {
            const { error } = await settingsTable().upsert(
                { key: 'accounting_start', value: isoDateFromDay(input.day), updated_at: new Date().toISOString(), updated_by: input.actor },
                { onConflict: 'key' },
            );
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance'] }),
    });
};

/** Брони с выездом от начала учёта по конец периода (московские сутки, края с запасом). */
export const useFinanceReserves = (startDay: number, toDay: number, enabled: boolean) =>
    useQuery({
        queryKey: FINANCE_KEYS.reserves(startDay, toDay),
        enabled,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('reserves')
                .select('id, guest, start, end, price, prepayment, external_source, rooms(id, title, hotels(id, title)), booking_cards(status), deals(stage, pipeline)')
                .gte('end', (startDay - 1) * DAY)
                .lte('end', (toDay + 2) * DAY)
                .order('end', { ascending: true })
                .limit(10000);
            if (error) throw error;

            return (data ?? []) as unknown as FinanceReserve[];
        },
    });

/** Все отели — для названий и для условий отелям без выездов в периоде. */
export const useFinanceHotels = () =>
    useQuery({
        queryKey: FINANCE_KEYS.hotels,
        queryFn: async () => {
            const { data, error } = await supabase.from('hotels').select('id, title').order('title');
            if (error) throw error;

            return (data ?? []) as HotelRef[];
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

export const usePayouts = (startDay: number, toDay: number, enabled: boolean) =>
    useQuery({
        queryKey: FINANCE_KEYS.payouts(startDay, toDay),
        enabled,
        queryFn: async () => {
            const { data, error } = await payoutsTable()
                .select('*')
                .is('deleted_at', null)
                .gte('paid_at', isoDateFromDay(startDay))
                .lte('paid_at', isoDateFromDay(toDay))
                .order('paid_at', { ascending: false })
                .limit(5000);
            if (error) throw error;

            return (data ?? []) as PayoutRow[];
        },
    });

export const useAdjustments = (startDay: number, toDay: number, enabled: boolean) =>
    useQuery({
        queryKey: FINANCE_KEYS.adjustments(startDay, toDay),
        enabled,
        queryFn: async () => {
            const { data, error } = await adjustmentsTable()
                .select('*')
                .is('deleted_at', null)
                .gte('date', isoDateFromDay(startDay))
                .lte('date', isoDateFromDay(toDay))
                .order('date', { ascending: false })
                .limit(5000);
            if (error) throw error;

            return (data ?? []) as AdjustmentRow[];
        },
    });

export type PaymentDetails = { hotel_id: string; bank: string | null; holder: string | null; requisites: string | null };

/** Реквизиты читаются один раз при открытии окна — фоновое перечитывание не затирает ввод. */
export const usePaymentDetails = (hotelId?: string) =>
    useQuery({
        queryKey: FINANCE_KEYS.details(hotelId ?? ''),
        enabled: !!hotelId,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
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
            // Сначала реквизиты, потом условия: если упадёт второе, условия останутся прежними и это видно.
            const { error: detailsError } = await detailsTable().upsert(
                { hotel_id: input.terms.hotel_id, ...input.details, updated_at: now, updated_by: input.actor },
                { onConflict: 'hotel_id' },
            );
            if (detailsError) throw new Error(`Реквизиты: ${detailsError.message}`);
            const { error } = await termsTable().upsert({ ...input.terms, updated_at: now, updated_by: input.actor }, { onConflict: 'hotel_id' });
            if (error) throw new Error(`Реквизиты сохранены, условия — нет: ${error.message}`);
        },
        onSuccess: () => invalidate(),
    });
};

export const useAddPayout = () => {
    const invalidate = useInvalidate();

    return useMutation({
        mutationFn: async (input: Omit<PayoutRow, 'id' | 'created_at' | 'deleted_at'>) => {
            const { error } = await payoutsTable().insert(input);
            if (error) throw error;
        },
        onSuccess: () => invalidate(),
    });
};

export const useAddAdjustment = () => {
    const invalidate = useInvalidate();

    return useMutation({
        mutationFn: async (input: Omit<AdjustmentRow, 'id' | 'created_at' | 'deleted_at'>) => {
            const { error } = await adjustmentsTable().insert(input);
            if (error) throw error;
        },
        onSuccess: () => invalidate(),
    });
};

/** Записи о деньгах не удаляются — помечаются; след остаётся. */
export const useSoftDeleteFinanceRow = () => {
    const invalidate = useInvalidate();

    return useMutation({
        mutationFn: async (input: { table: 'hotel_payouts' | 'finance_adjustments'; id: string; actor: string }) => {
            const { error } = await supabase
                .from(input.table)
                .update({ deleted_at: new Date().toISOString(), deleted_by: input.actor })
                .eq('id', input.id);
            if (error) throw error;
        },
        onSuccess: () => invalidate(),
    });
};
