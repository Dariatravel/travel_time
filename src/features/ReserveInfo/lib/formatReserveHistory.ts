import type { ReserveDTO } from '@/shared/api/reserve/reserve';
import dayjs from 'dayjs';

export type ReserveHistoryAction = 'created' | 'updated';

export type ReserveHistoryChange = {
    field: string;
    old: unknown;
    new: unknown;
};

export type ReserveHistoryEntry = {
    id: string;
    reserve_id: string;
    action: ReserveHistoryAction;
    changed_by: string | null;
    changed_at: string;
    changes: ReserveHistoryChange[];
};

const FIELD_LABELS: Record<string, string> = {
    start: 'Дата заезда',
    end: 'Дата выезда',
    room_id: 'Номер',
    guest: 'Гость',
    phone: 'Телефон',
    price: 'Стоимость',
    quantity: 'Гостей',
    prepayment: 'Предоплата',
    comment: 'Комментарий',
};

const DATE_FIELDS = new Set(['start', 'end']);

const formatValue = (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') {
        return '—';
    }

    if (DATE_FIELDS.has(field)) {
        const unix = typeof value === 'number' ? value : Number(value);
        if (!Number.isNaN(unix)) {
            return dayjs.unix(unix).format('DD.MM.YYYY');
        }
    }

    if (field === 'price' || field === 'prepayment') {
        const amount = typeof value === 'number' ? value : Number(value);
        if (!Number.isNaN(amount)) {
            return `${amount.toLocaleString('ru-RU')} ₽`;
        }
    }

    return String(value);
};

export const getReserveHistoryActionLabel = (action: ReserveHistoryAction): string => {
    switch (action) {
        case 'created':
            return 'Создано';
        case 'updated':
            return 'Изменено';
    }
};

export const getReserveHistoryChangeSummary = (changes: ReserveHistoryChange[]): string => {
    if (!changes.length) {
        return '';
    }

    const labels = new Set<string>();

    for (const change of changes) {
        if (change.field === 'start' || change.field === 'end') {
            labels.add('даты');
            continue;
        }

        const label = FIELD_LABELS[change.field];
        if (label) {
            labels.add(label.toLowerCase());
        }
    }

    return Array.from(labels).join(', ');
};

export const formatReserveHistoryChangeLine = (change: ReserveHistoryChange): string => {
    const label = FIELD_LABELS[change.field] ?? change.field;
    return `${label}: ${formatValue(change.field, change.old)} → ${formatValue(change.field, change.new)}`;
};

export const buildFallbackReserveHistory = (
    reserve?: Partial<ReserveDTO>,
): ReserveHistoryEntry[] => {
    if (!reserve?.created_at) {
        return [];
    }

    const entries: ReserveHistoryEntry[] = [
        {
            id: 'fallback-created',
            reserve_id: reserve.id ?? '',
            action: 'created',
            changed_by: reserve.created_by ?? null,
            changed_at: reserve.created_at,
            changes: [],
        },
    ];

    const hasSeparateEdit =
        reserve.edited_at &&
        reserve.edited_at !== reserve.created_at &&
        (reserve.edited_by || reserve.edited_at);

    if (hasSeparateEdit) {
        entries.unshift({
            id: 'fallback-updated',
            reserve_id: reserve.id ?? '',
            action: 'updated',
            changed_by: reserve.edited_by ?? null,
            changed_at: reserve.edited_at!,
            changes: [],
        });
    }

    return entries.sort(
        (a, b) => dayjs(b.changed_at).valueOf() - dayjs(a.changed_at).valueOf(),
    );
};

export const parseReserveHistoryChanges = (raw: unknown): ReserveHistoryChange[] => {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw.filter(
        (item): item is ReserveHistoryChange =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as ReserveHistoryChange).field === 'string',
    );
};
