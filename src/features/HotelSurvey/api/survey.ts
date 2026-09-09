import supabase from '@/shared/config/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SurveyAnswerValue } from '../model/questions';

export type SurveyObject = {
    slug: string;
    kind: 'hotel' | 'kvartira';
    title: string;
    city: string;
    summary: string;
    location: string;
    coverUrl: string | null;
    pageUrl: string;
};

export type SurveyParticipant = { id: string; name: string; role: string; email: string | null };

export type AnswerRow = {
    user_id: string;
    object_slug: string;
    question_id: string;
    answer: SurveyAnswerValue;
    updated_at: string;
};

export type ProgressRow = {
    user_id: string;
    object_slug: string;
    status: 'done' | 'skipped';
    updated_at: string;
};

export const SURVEY_KEYS = {
    objects: ['survey', 'objects'] as const,
    myAnswers: ['survey', 'my-answers'] as const,
    myProgress: ['survey', 'my-progress'] as const,
    allAnswers: ['survey', 'all-answers'] as const,
    allProgress: ['survey', 'all-progress'] as const,
    participants: ['survey', 'participants'] as const,
};

const authHeaders = async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const getJson = async <T>(url: string): Promise<T> => {
    const response = await fetch(url, { headers: await authHeaders() });
    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
    }
    return payload as T;
};

const currentUserId = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error('Не авторизован');
    return data.user.id;
};

// Таблицы опроса временные и в database.types.ts не описаны — клиент
// без generic, поэтому обращения через строковое имя таблицы.
const answersTable = () => supabase.from('hotel_survey_answers');
const progressTable = () => supabase.from('hotel_survey_progress');

export const useSurveyObjects = () =>
    useQuery({
        queryKey: SURVEY_KEYS.objects,
        queryFn: async () =>
            (await getJson<{ objects: SurveyObject[] }>('/api/survey/objects')).objects,
        staleTime: 60 * 60 * 1000,
    });

export const useMyAnswers = () =>
    useQuery({
        queryKey: SURVEY_KEYS.myAnswers,
        queryFn: async () => {
            const userId = await currentUserId();
            const { data, error } = await answersTable().select('*').eq('user_id', userId);
            if (error) throw error;
            return (data ?? []) as AnswerRow[];
        },
    });

export const useMyProgress = () =>
    useQuery({
        queryKey: SURVEY_KEYS.myProgress,
        queryFn: async () => {
            const userId = await currentUserId();
            const { data, error } = await progressTable().select('*').eq('user_id', userId);
            if (error) throw error;
            return (data ?? []) as ProgressRow[];
        },
    });

/** Сохранить ответ на вопрос (upsert). Пустой ответ — удалить строку. */
export const useSaveAnswer = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: {
            objectSlug: string;
            questionId: string;
            value: SurveyAnswerValue | null;
        }) => {
            const userId = await currentUserId();
            if (input.value === null) {
                const { error } = await answersTable()
                    .delete()
                    .eq('user_id', userId)
                    .eq('object_slug', input.objectSlug)
                    .eq('question_id', input.questionId);
                if (error) throw error;
                return;
            }
            const { error } = await answersTable().upsert(
                {
                    user_id: userId,
                    object_slug: input.objectSlug,
                    question_id: input.questionId,
                    answer: input.value,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,object_slug,question_id' },
            );
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: SURVEY_KEYS.myAnswers }),
    });
};

/** Отметить объект пройденным или пропущенным. */
export const useSetProgress = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: { objectSlug: string; status: 'done' | 'skipped' }) => {
            const userId = await currentUserId();
            const { error } = await progressTable().upsert(
                {
                    user_id: userId,
                    object_slug: input.objectSlug,
                    status: input.status,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,object_slug' },
            );
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: SURVEY_KEYS.myProgress }),
    });
};

// ---- статистика (только админ: RLS отдаёт все строки лишь роли admin) ----

export const useAllAnswers = () =>
    useQuery({
        queryKey: SURVEY_KEYS.allAnswers,
        queryFn: async () => {
            const { data, error } = await answersTable().select('*').limit(50000);
            if (error) throw error;
            return (data ?? []) as AnswerRow[];
        },
    });

export const useAllProgress = () =>
    useQuery({
        queryKey: SURVEY_KEYS.allProgress,
        queryFn: async () => {
            const { data, error } = await progressTable().select('*').limit(50000);
            if (error) throw error;
            return (data ?? []) as ProgressRow[];
        },
    });

export const useParticipants = () =>
    useQuery({
        queryKey: SURVEY_KEYS.participants,
        queryFn: async () =>
            (await getJson<{ participants: SurveyParticipant[] }>('/api/survey/participants'))
                .participants,
    });
