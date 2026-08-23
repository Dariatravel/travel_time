export const TRANSACTIONAL_ICAL_SYNC_ENV = 'TRANSACTIONAL_ICAL_SYNC_ENABLED';
export const TRANSACTIONAL_ICAL_MIN_RATIO_ENV = 'TRANSACTIONAL_ICAL_MIN_RETAINED_RATIO';
export const TRANSACTIONAL_ICAL_CONFIRM_DECREASE_ENV = 'TRANSACTIONAL_ICAL_CONFIRM_LARGE_DECREASE';

const DEFAULT_MIN_RETAINED_RATIO = 0.5;

export const isTransactionalIcalSyncEnabled = (
    value = process.env[TRANSACTIONAL_ICAL_SYNC_ENV],
): boolean => value?.trim().toLowerCase() !== 'false';

export const getTransactionalIcalMinRetainedRatio = (
    value = process.env[TRANSACTIONAL_ICAL_MIN_RATIO_ENV],
): number => {
    if (value === undefined || value.trim() === '') return DEFAULT_MIN_RETAINED_RATIO;
    const ratio = Number(value);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
        throw new Error(`${TRANSACTIONAL_ICAL_MIN_RATIO_ENV} должен быть числом от 0 до 1`);
    }
    return ratio;
};

export const isLargeIcalDecreaseConfirmed = (
    value = process.env[TRANSACTIONAL_ICAL_CONFIRM_DECREASE_ENV],
): boolean => value?.trim().toLowerCase() === 'true';

/**
 * Правила одинаковы для всех зеркал: iCal, Google-таблиц, Контура, Bnovo.
 * Название источника подставляется в текст, чтобы в журнале было видно, кто
 * именно отдал подозрительный ответ.
 */
export const getSyncSafetyError = ({
    sourceLabel = 'Источник',
    sourceComplete,
    confirmedEmpty,
    existingCount,
    proposedCount,
    minRetainedRatio,
    confirmLargeDecrease,
}: {
    sourceComplete: boolean;
    confirmedEmpty: boolean;
    existingCount: number;
    proposedCount: number;
    minRetainedRatio: number;
    confirmLargeDecrease: boolean;
    sourceLabel?: string;
}): string | null => {
    if (!sourceComplete) {
        return `${sourceLabel} вернул неполный ответ; текущая занятость сохранена`;
    }
    if (existingCount > 0 && proposedCount === 0 && !confirmedEmpty) {
        return `${sourceLabel} не подтвердил пустой ответ; текущая занятость сохранена`;
    }
    if (
        existingCount > 0 &&
        proposedCount > 0 &&
        proposedCount / existingCount < minRetainedRatio &&
        !confirmLargeDecrease
    ) {
        return `${sourceLabel}: число меток подозрительно уменьшилось: ${existingCount} -> ${proposedCount}; текущая занятость сохранена`;
    }
    return null;
};

export const parseExternalOccupancySummary = (
    data: unknown,
): { inserted: number; skippedManual: number } => {
    const summary = data as {
        status?: unknown;
        error?: unknown;
        inserted?: unknown;
        skipped_manual?: unknown;
    } | null;
    if (summary?.status === 'error' && typeof summary.error === 'string') {
        throw new Error(summary.error);
    }
    if (
        !summary ||
        (summary.status !== 'ok' && summary.status !== 'partial') ||
        typeof summary.inserted !== 'number' ||
        typeof summary.skipped_manual !== 'number'
    ) {
        throw new Error('Некорректный ответ sync_external_occupancy');
    }
    return { inserted: summary.inserted, skippedManual: summary.skipped_manual };
};

export type IcalSyncMarker = {
    roomId: string;
    start: number;
    end: number;
    icalId: number;
};

export const toExternalOccupancyMarks = (
    markers: IcalSyncMarker[],
    source: { tag: string; guest: string },
    comment: string,
) =>
    markers.map((marker) => ({
        room_id: marker.roomId,
        start_at: marker.start,
        end_at: marker.end,
        guest: source.guest,
        comment,
        external_uid: `${source.tag}:${marker.roomId}:${marker.start}-${marker.end}`,
        external_feed_url: `https://public-api.reservationsteps.ru/v1/api/ical/${marker.icalId}`,
    }));

/** Прежнее имя для iCal-пути; оставлено, чтобы не переписывать рабочий код. */
export const getIcalSyncSafetyError = (params: Parameters<typeof getSyncSafetyError>[0]) =>
    getSyncSafetyError({ sourceLabel: 'Источник iCal', ...params });
