import supabase from '@/shared/config/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
    clientSearchTerm,
    normalizePhone,
    type ClientRow,
    type DealMessageRow,
    type DealRow,
    type Pipeline,
    type Stage,
} from '../lib/crm';

export const CRM_KEYS = {
    deals: (pipeline: Pipeline) => ['crm', 'deals', pipeline] as const,
    deal: (id: string) => ['crm', 'deal', id] as const,
    messages: (clientId: string) => ['crm', 'messages', clientId] as const,
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
/** Переписка: последние N сообщений (самые длинные чаты в выгрузке — до 770). */
export const MESSAGES_LIMIT = 800;

const authHeaders = async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    return token
        ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' };
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
                            .order('arrived_stage_at', { ascending: false })
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

/** Переписка клиента (в OKO чат — на контакт): последние MESSAGES_LIMIT, в хронологическом порядке. */
export const useClientMessages = (clientId?: string | null, enabled = true) =>
    useQuery({
        queryKey: CRM_KEYS.messages(clientId ?? ''),
        enabled: !!clientId && enabled,
        queryFn: async () => {
            const { data, error } = await messagesTable()
                .select('*')
                .eq('client_id', clientId)
                .order('sent_at', { ascending: false })
                .limit(MESSAGES_LIMIT);
            if (error) throw error;

            return ((data ?? []) as DealMessageRow[]).reverse();
        },
    });

export type DealPatch = Partial<
    Pick<
        DealRow,
        | 'title' | 'stage' | 'pipeline' | 'source' | 'responsible' | 'hotel_title' | 'check_in' | 'check_out'
        | 'people' | 'price_per_night' | 'nights' | 'service_note' | 'total' | 'prepaid' | 'to_pay'
        | 'payment_bank' | 'payment_date' | 'comment' | 'refund_amount' | 'penalty' | 'reserve_id'
    >
>;

export const useSaveDeal = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { id: string; patch: DealPatch; actor: string; stageChanged: boolean }) => {
            const now = new Date().toISOString();
            const { error } = await dealsTable()
                .update({
                    ...input.patch,
                    ...(input.stageChanged ? { arrived_stage_at: now } : {}),
                    updated_at: now,
                    updated_by: input.actor,
                })
                .eq('id', input.id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm'] }),
    });
};

/** Найти клиента по номеру или создать. Номер приводится к +7…, дубли не плодятся. */
const findOrCreateClient = async (name: string, phoneRaw: string, responsible: string): Promise<string | null> => {
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    if (phone) {
        const { data, error } = await clientsTable().select('id').filter('phones', 'cs', `{${phone}}`).limit(1);
        if (error) throw error;
        if (data && data.length > 0) return (data[0] as { id: string }).id;
    }
    if (!name && !phone) return null;
    const { data, error } = await clientsTable()
        .insert({ name: name || null, phones: phone ? [phone] : [], responsible })
        .select('id')
        .single();
    if (error) throw error;

    return (data as { id: string }).id;
};

export const useCreateDeal = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { title: string; source: string | null; responsible: string; clientName: string; clientPhone: string }) => {
            const clientId = await findOrCreateClient(input.clientName, input.clientPhone, input.responsible);
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

/** Клиенты: без запроса — последние; поиск на сервере по имени или цифрам номера. */
export const useClients = (term: string) =>
    useQuery({
        queryKey: CRM_KEYS.clients(term),
        queryFn: async () => {
            const { phoneDigits, name } = clientSearchTerm(term);
            const { data, error } = await supabase.rpc('crm_search_clients', {
                p_name: name ? name.replace(/[%_*]/g, '') : null,
                p_digits: phoneDigits,
                p_limit: 100,
            });
            if (error) throw error;

            return (data ?? []) as ClientRow[];
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
                .order('created_at', { ascending: false })
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

    return payload as { ok: true; written: number; skipped: number };
};
