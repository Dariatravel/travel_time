import supabase from '@/shared/config/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { InboxRow } from '../lib/inbox';

export const INBOX_KEYS = {
    list: (days: number) => ['inbox', 'list', days] as const,
    chat: (messengerId: number) => ['inbox', 'chat', messengerId] as const,
};

export type ChatMessage = {
    id: number;
    direction: 'in' | 'out';
    author_name: string | null;
    text: string | null;
    files: string[];
    sent_at: string | null;
    oko_client_id: number | null;
    oko_contact_messenger_id: number | null;
    client_id: string | null;
};

/** Список переписок: одна строка на чат, свежие сверху. Обновляется сам. */
export const useInbox = (days: number) =>
    useQuery({
        queryKey: INBOX_KEYS.list(days),
        refetchInterval: 60_000,
        queryFn: async () => {
            const { data, error } = await supabase.rpc('oko_inbox', { p_days: days, p_limit: 400 });
            if (error) throw error;

            return (data ?? []) as InboxRow[];
        },
    });

/** Переписка одного чата целиком. */
export const useChat = (messengerId?: number | null) =>
    useQuery({
        queryKey: INBOX_KEYS.chat(messengerId ?? 0),
        enabled: !!messengerId,
        refetchInterval: 30_000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('deal_messages')
                .select('id, direction, author_name, text, files, sent_at, oko_client_id, oko_contact_messenger_id, client_id')
                .eq('oko_contact_messenger_id', messengerId)
                .order('sent_at', { ascending: false })
                .limit(300);
            if (error) throw error;

            return ((data ?? []) as ChatMessage[]).reverse();
        },
    });

/** Ответ клиенту — через очередь; отправляет Mac mini, не позже чем через минуту. */
export const useReply = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: {
            messengerId: number;
            okoClientId: number | null;
            clientId: string | null;
            dealId: string | null;
            text: string;
            actor: string;
        }) => {
            const { error } = await supabase.from('oko_outbox').insert({
                kind: 'message',
                priority: 1,
                payload: {
                    client_id: input.okoClientId,
                    contact_messenger_id: input.messengerId,
                    text: input.text,
                },
                client_id: input.clientId,
                deal_id: input.dealId,
                created_by: input.actor,
            });
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
    });
};

export type OutboxRow = {
    id: string;
    status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'stuck';
    payload: { text?: string } & Record<string, unknown>;
    last_error: string | null;
    created_at: string;
};

/** Что ещё не ушло по этому чату. */
export const useChatOutbox = (messengerId?: number | null) =>
    useQuery({
        queryKey: ['inbox', 'outbox', messengerId ?? 0],
        enabled: !!messengerId,
        refetchInterval: 20_000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('oko_outbox')
                .select('id, status, payload, last_error, created_at')
                .eq('kind', 'message')
                .contains('payload', { contact_messenger_id: messengerId })
                .neq('status', 'sent')
                .order('created_at', { ascending: true })
                .limit(20);
            if (error) throw error;

            return (data ?? []) as OutboxRow[];
        },
    });

/** Привязать чат к существующему клиенту: временная карточка вливается в настоящую. */
export const useMergeClients = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { from: string; into: string }) => {
            const { error } = await supabase.rpc('oko_merge_clients', { p_from: input.from, p_into: input.into });
            if (error) throw error;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['inbox'] });
            void queryClient.invalidateQueries({ queryKey: ['crm'] });
        },
    });
};
