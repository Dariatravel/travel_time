import supabase from '@/shared/config/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
    clientSearchTerm,
    type ClientRow,
    type DealMessageRow,
    type DealRow,
    type Pipeline,
    type Stage,
} from '../lib/crm';

export const CRM_KEYS = {
    deals: (pipeline: Pipeline) => ['crm', 'deals', pipeline] as const,
    deal: (id: string) => ['crm', 'deal', id] as const,
    messages: (dealId: string) => ['crm', 'messages', dealId] as const,
    clients: (term: string) => ['crm', 'clients', term] as const,
    clientDeals: (clientId: string) => ['crm', 'client-deals', clientId] as const,
    counts: ['crm', 'counts'] as const,
};

// Таблицы новые и в database.types.ts не описаны — по строковому имени.
const dealsTable = () => supabase.from('deals');
const clientsTable = () => supabase.from('clients');
const messagesTable = () => supabase.from('deal_messages');

const DEAL_SELECT = '*, clients(id, name, phones, emails, responsible, oko_contact_id)';
/** Колонки «Заявка» и «Думают» в OKO держат тысячи сделок; для канбана хватает свежих. */
export const DEALS_PER_STAGE = 60;

const authHeaders = async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

/** Сделки воронки: по каждому этапу — последние DEALS_PER_STAGE + точный счётчик и сумма. */
export type StageStats = Record<string, { count: number; sum: number }>;

export const useDealsBoard = (pipeline: Pipeline, stages: Stage[]) =>
    useQuery({
        queryKey: [...CRM_KEYS.deals(pipeline), stages.join(',')],
        queryFn: async () => {
            const [perStage, statsResult] = await Promise.all([
                Promise.all(
                    stages.map(async (stage) => {
                        const { data, error } = await dealsTable()
                            .select(DEAL_SELECT)
                            .eq('pipeline', pipeline)
                            .eq('stage', stage)
                            .order('arrived_stage_at', { ascending: false, nullsFirst: false })
                            .limit(DEALS_PER_STAGE);
                        if (error) throw error;

                        return (data ?? []) as unknown as DealRow[];
                    }),
                ),
                // Счётчик и сумма по этапам — SQL-функцией, как в шапке колонок OKO.
                supabase.rpc('crm_stage_stats', { p_pipeline: pipeline }),
            ]);
            if (statsResult.error) throw statsResult.error;
            const stats: StageStats = {};
            for (const stage of stages) stats[stage] = { count: 0, sum: 0 };
            for (const row of (statsResult.data ?? []) as { stage: string; count: number; sum: number | null }[]) {
                stats[row.stage] = { count: Number(row.count ?? 0), sum: Number(row.sum ?? 0) };
            }

            return { deals: perStage.flat(), stats };
        },
    });

export const useDealMessages = (dealId?: string, enabled = true) =>
    useQuery({
        queryKey: CRM_KEYS.messages(dealId ?? ''),
        enabled: !!dealId && enabled,
        queryFn: async () => {
            const { data, error } = await messagesTable()
                .select('*')
                .eq('deal_id', dealId)
                .order('sent_at', { ascending: true })
                .limit(500);
            if (error) throw error;

            return (data ?? []) as DealMessageRow[];
        },
    });

export type DealPatch = Partial<
    Pick<
        DealRow,
        | 'title' | 'stage' | 'pipeline' | 'source' | 'responsible' | 'hotel_title' | 'check_in' | 'check_out'
        | 'people' | 'price_per_night' | 'nights' | 'service_note' | 'total' | 'prepaid' | 'to_pay'
        | 'payment_bank' | 'payment_date' | 'comment' | 'reserve_id'
    >
>;

export const useSaveDeal = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { id: string; patch: DealPatch; actor: string }) => {
            const { error } = await dealsTable()
                .update({ ...input.patch, updated_at: new Date().toISOString(), updated_by: input.actor })
                .eq('id', input.id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm'] }),
    });
};

export const useCreateDeal = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { title: string; source: string | null; responsible: string; clientName: string; clientPhone: string }) => {
            let clientId: string | null = null;
            if (input.clientName || input.clientPhone) {
                const { data, error } = await clientsTable()
                    .insert({
                        name: input.clientName || null,
                        phones: input.clientPhone ? [input.clientPhone] : [],
                        responsible: input.responsible,
                    })
                    .select('id')
                    .single();
                if (error) throw error;
                clientId = (data as { id: string }).id;
            }
            const { error } = await dealsTable().insert({
                title: input.title || null,
                client_id: clientId,
                source: input.source,
                responsible: input.responsible,
                pipeline: 'sales',
                stage: 'zayavka',
                arrived_stage_at: new Date().toISOString(),
                updated_by: input.responsible,
            });
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm'] }),
    });
};

/** Клиенты: без запроса — последние; по телефону — цифры; по имени — подстрока. */
export const useClients = (term: string) =>
    useQuery({
        queryKey: CRM_KEYS.clients(term),
        queryFn: async () => {
            const { phoneDigits, name } = clientSearchTerm(term);
            let query = clientsTable().select('*').order('oko_created_at', { ascending: false, nullsFirst: false }).limit(100);
            if (name) query = query.ilike('name', `%${name.replace(/[%_]/g, '')}%`);
            if (phoneDigits) query = query.filter('phones', 'cs', `{+${phoneDigits}}`);
            const { data, error } = await query;
            if (error) throw error;
            const rows = (data ?? []) as ClientRow[];
            // Поиск по части номера: точное совпадение массива не найдёт «+7900…» по «7900» — добираем на клиенте.
            if (phoneDigits && rows.length === 0) {
                const { data: wide, error: wideError } = await clientsTable()
                    .select('*')
                    .order('oko_created_at', { ascending: false, nullsFirst: false })
                    .limit(2000);
                if (wideError) throw wideError;

                return ((wide ?? []) as ClientRow[]).filter((c) => c.phones.some((p) => p.replace(/\D/g, '').includes(phoneDigits))).slice(0, 100);
            }

            return rows;
        },
    });

export const useClientDeals = (clientId?: string) =>
    useQuery({
        queryKey: CRM_KEYS.clientDeals(clientId ?? ''),
        enabled: !!clientId,
        queryFn: async () => {
            const { data, error } = await dealsTable()
                .select(DEAL_SELECT)
                .eq('client_id', clientId)
                .order('oko_created_at', { ascending: false, nullsFirst: false })
                .limit(50);
            if (error) throw error;

            return (data ?? []) as unknown as DealRow[];
        },
    });

export const useCrmCounts = () =>
    useQuery({
        queryKey: CRM_KEYS.counts,
        queryFn: async () => {
            const [c, d, m] = await Promise.all([
                clientsTable().select('id', { count: 'exact', head: true }),
                dealsTable().select('id', { count: 'exact', head: true }),
                messagesTable().select('id', { count: 'exact', head: true }),
            ]);
            if (c.error) throw c.error;
            if (d.error) throw d.error;
            if (m.error) throw m.error;

            return { clients: c.count ?? 0, deals: d.count ?? 0, messages: m.count ?? 0 };
        },
    });

/** Пачка строк в серверный роут импорта. */
export const importBatch = async (table: 'clients' | 'deals' | 'deal_messages', rows: Record<string, unknown>[]) => {
    const response = await fetch('/api/crm/import', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ table, rows }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`);

    return payload as { ok: true; written: number };
};

export const importLink = async () => {
    const response = await fetch('/api/crm/import', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ action: 'link' }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`);

    return payload as { ok: true; deals_linked?: number; messages_linked?: number };
};
