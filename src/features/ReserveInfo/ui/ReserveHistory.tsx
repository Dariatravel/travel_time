'use client';

import {
    formatReserveHistoryChangeLine,
    getReserveHistoryActionLabel,
    getReserveHistoryChangeSummary,
    type ReserveHistoryEntry,
} from '@/features/ReserveInfo/lib/formatReserveHistory';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import { FC, useMemo, useState } from 'react';
import cx from './style.module.scss';

type ReserveHistoryProps = {
    entries: ReserveHistoryEntry[];
    isLoading?: boolean;
};

export const ReserveHistory: FC<ReserveHistoryProps> = ({ entries, isLoading }) => {
    const [showAll, setShowAll] = useState(false);
    const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

    const visibleEntries = useMemo(() => {
        if (showAll || entries.length <= 4) {
            return entries;
        }
        return entries.slice(0, 4);
    }, [entries, showAll]);

    if (isLoading) {
        return (
            <section className={cx.history} aria-label="История изменений брони">
                <div className={cx.historyHeader}>
                    <p className={cx.historyTitle}>История изменений</p>
                </div>
                <p className={cx.historyEmpty}>Загрузка истории…</p>
            </section>
        );
    }

    if (entries.length === 0) {
        return null;
    }

    return (
        <section className={cx.history} aria-label="История изменений брони">
            <div className={cx.historyHeader}>
                <p className={cx.historyTitle}>История изменений</p>
                <span className={cx.historyCount}>{entries.length}</span>
            </div>

            <ol className={cx.historyList}>
                {visibleEntries.map((entry, index) => {
                    const summary = getReserveHistoryChangeSummary(entry.changes);
                    const isLast = index === visibleEntries.length - 1;
                    const isExpanded = expandedEntryId === entry.id;
                    const hasDetails = entry.changes.length > 0;

                    return (
                        <li key={entry.id} className={cx.historyItem}>
                            <div className={cn(cx.historyMarker, isLast && cx.historyMarkerLast)} />
                            <div className={cx.historyContent}>
                                <div className={cx.historyMeta}>
                                    <span className={cx.historyAction}>
                                        {getReserveHistoryActionLabel(entry.action)}
                                    </span>
                                    <span className={cx.historyDate}>
                                        {dayjs(entry.changed_at).format('DD.MM.YYYY HH:mm')}
                                    </span>
                                </div>

                                {entry.changed_by && (
                                    <p className={cx.historyActor}>{entry.changed_by}</p>
                                )}

                                <p className={cx.historySummary}>
                                    {entry.action === 'created'
                                        ? 'Бронь добавлена в шахматку'
                                        : summary || 'Данные обновлены'}
                                </p>

                                {hasDetails && (
                                    <button
                                        type="button"
                                        className={cx.historyDetailsButton}
                                        onClick={() =>
                                            setExpandedEntryId(isExpanded ? null : entry.id)
                                        }
                                    >
                                        {isExpanded ? 'Скрыть детали' : 'Показать детали'}
                                    </button>
                                )}

                                {isExpanded && (
                                    <ul className={cx.historyDetails}>
                                        {entry.changes.map((change) => (
                                            <li key={`${entry.id}-${change.field}`}>
                                                {formatReserveHistoryChangeLine(change)}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ol>

            {entries.length > 4 && (
                <button
                    type="button"
                    className={cx.historyToggle}
                    onClick={() => setShowAll((value) => !value)}
                >
                    {showAll ? 'Свернуть' : `Показать все (${entries.length})`}
                </button>
            )}
        </section>
    );
};
