import { notifyError, notifySuccess } from '@/shared/ui/Toast/Toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type CreateOperatorPayload = {
    email: string;
    password: string;
    name: string;
    surname: string;
    phone: string;
};

export type OperatorListItem = {
    id: string;
    email: string;
    name?: string;
    surname?: string;
    phone?: string;
    createdAt?: string;
};

const OPERATORS_QUERY_KEY = ['admin', 'operators'] as const;

const parseResponse = async <T>(response: Response): Promise<T> => {
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error ?? 'Request failed');
    }

    return data as T;
};

export const getOperators = async () => {
    const response = await fetch('/api/admin/operators');
    const data = await parseResponse<{ operators: OperatorListItem[] }>(response);
    return data.operators;
};

export const createOperator = async (payload: CreateOperatorPayload) => {
    const response = await fetch('/api/admin/operators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const data = await parseResponse<{ operator: OperatorListItem }>(response);
    return data.operator;
};

export const useGetOperators = (enabled = true) =>
    useQuery({
        queryKey: OPERATORS_QUERY_KEY,
        queryFn: getOperators,
        enabled,
    });

export const useCreateOperator = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createOperator,
        onSuccess: () => {
            notifySuccess('Оператор успешно создан');
            queryClient.invalidateQueries({ queryKey: OPERATORS_QUERY_KEY });
        },
        onError: (error: Error) => {
            notifyError(error.message || 'Не удалось создать оператора');
        },
    });
};
