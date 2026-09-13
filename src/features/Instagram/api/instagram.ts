import supabase from '@/shared/config/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ChannelRow, ChatKind, ChatRow, MessageRow, OutboxRow, OutboxStatus, SendMode } from '../lib/instagram';

/**
 * Данные экрана Instagram. Читаем из базы напрямую (RLS пускает только
 * admin), а отправка и настройка — через сервер: ключ Wazzup есть только там.
 */

export const INSTAGRAM_KEYS = {
    all: ['instagram'] as const,
    chats: (kind: ChatKind) => ['instagram', 'chats', kind] as const,
    messages: (chatId: string) => ['instagram', 'messages', chatId] as const,
    outbox: (chatId: string) => ['instagram', 'outbox', chatId] as const,
    channels: ['instagram', 'channels'] as const,
    status: ['instagram', 'wazzup-status'] as const,
};

/** Ошибка сервера вместе с телом ответа: экрану нужны, например, needsConfirm. */
export class ApiError extends Error {
    status: number;
    data: Record<string, unknown> | null;

    constructor(message: string, status: number, data: Record<string, unknown> | null) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

const authHeaders = async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    return token ? { Authorization: `Bearer ${token}` } : {};
};

const requestJson = async <T>(url: string, payload?: unknown): Promise<T> => {
    const response = await fetch(url, {
        method: payload === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    let data: Record<string, unknown> | null = null;
    try {
        data = (await response.json()) as Record<string, unknown>;
    } catch {
        // Пустой или не-JSON ответ — ниже будет общая ошибка.
    }
    if (!response.ok) {
        throw new ApiError(
            typeof data?.error === 'string' ? data.error : `Ошибка сервера ${response.status}`,
            response.status,
            data,
        );
    }

    return data as T;
};

/** Список чатов вкладки. Обновляется сам раз в 45 секунд. */
export const useInstagramChats = (kind: ChatKind, enabled: boolean) =>
    useQuery({
        queryKey: INSTAGRAM_KEYS.chats(kind),
        enabled,
        refetchInterval: 45_000,
        queryFn: async () => {
            const { data, error } = await supabase.rpc('messenger_chat_list', {
                p_chat_type: 'instagram',
                p_kind: kind,
                p_limit: 400,
            });
            if (error) throw error;

            return (data ?? []) as ChatRow[];
        },
    });

export const useChatMessages = (chatId: string) =>
    useQuery({
        queryKey: INSTAGRAM_KEYS.messages(chatId),
        refetchInterval: 30_000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('messenger_messages')
                .select(
                    'id, external_id, direction, is_echo, sent_from_app, author_name, type, text, content_uri, status, error, is_edited, is_deleted, sent_at',
                )
                .eq('chat_id', chatId)
                .order('sent_at', { ascending: false })
                .limit(300);
            if (error) throw error;

            return ((data ?? []) as MessageRow[]).reverse();
        },
    });

/** Наши отправки за 7 дней: столько же длится окно приватного ответа. */
export const useChatOutbox = (chatId: string) =>
    useQuery({
        queryKey: INSTAGRAM_KEYS.outbox(chatId),
        refetchInterval: 20_000,
        queryFn: async () => {
            const since = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
            const { data, error } = await supabase
                .from('messenger_outbox')
                .select('id, mode, ref_external_id, text, status, external_message_id, error, created_by, created_at, sent_at')
                .eq('chat_id', chatId)
                .gte('created_at', since)
                .order('created_at', { ascending: true })
                .limit(50);
            if (error) throw error;

            return (data ?? []) as OutboxRow[];
        },
    });

export const useChannels = () =>
    useQuery({
        queryKey: INSTAGRAM_KEYS.channels,
        refetchInterval: 60_000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('messenger_channels')
                .select('external_id, transport, plain_id, state, updated_at')
                .eq('provider', 'wazzup')
                .order('transport', { ascending: true });
            if (error) throw error;

            return (data ?? []) as ChannelRow[];
        },
    });

export type WazzupStatus = { configured: boolean; message: string | null; subscribeBlocker: string | null };

/** Подключён ли Wazzup на этом контуре — без обращений к самому Wazzup. */
export const useWazzupStatus = () =>
    useQuery({
        queryKey: INSTAGRAM_KEYS.status,
        staleTime: 5 * 60_000,
        queryFn: () => requestJson<WazzupStatus>('/api/wazzup/setup'),
    });

export type SendResult = { id: string; status: OutboxStatus; error: string | null; repeated?: boolean };

export const useSendReply = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: {
            draftId: string;
            chatId: string;
            mode: SendMode;
            text: string;
            refExternalId: string | null;
        }) => requestJson<SendResult>('/api/wazzup/send', input),
        onSettled: () => queryClient.invalidateQueries({ queryKey: INSTAGRAM_KEYS.all }),
    });
};

export type SetupResult = {
    channels: { external_id: string; transport: string | null; plain_id: string | null; state: string | null }[];
    subscription: { ok: boolean; message: string; url?: string } | null;
};

export const useWazzupSetup = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: { subscribe: boolean; confirm?: string }) =>
            requestJson<SetupResult>('/api/wazzup/setup', input),
        onSettled: () => queryClient.invalidateQueries({ queryKey: INSTAGRAM_KEYS.channels }),
    });
};
