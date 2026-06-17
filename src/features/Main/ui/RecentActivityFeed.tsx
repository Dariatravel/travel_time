'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatReserveHistoryChangeLine } from '@/features/ReserveInfo/lib/formatReserveHistory';
import { cn } from '@/lib/utils';
import { Loader } from '@/shared';
import {
    DASHBOARD_ACTIVITY_PAGE_SIZE,
    getActivitySummary,
    getActivityTitle,
    useRecentActivity,
} from '@/shared/api/activity/recentActivity';
import { PagesEnum, routes } from '@/shared/config/routes';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export const RecentActivityFeed = () => {
    const { data: entries = [], isLoading, isError, error, refetch } = useRecentActivity();
    const [showAll, setShowAll] = useState(false);
    const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

    const visibleEntries = useMemo(() => {
        if (showAll || entries.length <= DASHBOARD_ACTIVITY_PAGE_SIZE) {
            return entries;
        }

        return entries.slice(0, DASHBOARD_ACTIVITY_PAGE_SIZE);
    }, [entries, showAll]);

    return (
        <Card className="bg-white/90 border shadow-sm">
            <CardHeader>
                <CardTitle>Последние изменения</CardTitle>
                <CardDescription>
                    Действия пользователей в бронированиях: создание и редактирование.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading && (
                    <div className="flex justify-center py-10">
                        <Loader />
                    </div>
                )}

                {isError && (
                    <div className="space-y-3">
                        <p className="text-sm text-red-600">
                            {(error as Error)?.message || 'Не удалось загрузить историю изменений'}
                        </p>
                        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                            Повторить загрузку
                        </Button>
                    </div>
                )}

                {!isLoading && !isError && entries.length === 0 && (
                    <p className="text-sm text-muted-foreground">Изменений пока нет.</p>
                )}

                {!isLoading && !isError && entries.length > 0 && (
                    <div className="space-y-4">
                        <ol className="space-y-3">
                            {visibleEntries.map((entry) => {
                                const isExpanded = expandedEntryId === entry.id;
                                const hasDetails = entry.changes.length > 0;

                                return (
                                    <li
                                        key={entry.id}
                                        className="rounded-lg border bg-white px-4 py-3"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="space-y-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-medium">
                                                        {getActivityTitle(entry)}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {dayjs(entry.changed_at).format(
                                                            'DD.MM.YYYY HH:mm',
                                                        )}
                                                    </span>
                                                </div>

                                                {entry.changed_by && (
                                                    <p className="text-sm text-foreground">
                                                        {entry.changed_by}
                                                    </p>
                                                )}

                                                <p className="text-sm text-muted-foreground">
                                                    {getActivitySummary(entry)}
                                                </p>

                                                <p className="text-sm">
                                                    {entry.hotelTitle && (
                                                        <>
                                                            <span className="font-medium">
                                                                {entry.hotelTitle}
                                                            </span>
                                                            {entry.roomTitle && (
                                                                <span>{` · ${entry.roomTitle}`}</span>
                                                            )}
                                                            {entry.guest && (
                                                                <span>{` · ${entry.guest}`}</span>
                                                            )}
                                                        </>
                                                    )}
                                                </p>
                                            </div>

                                            {entry.hotelId && (
                                                <Link
                                                    href={routes[PagesEnum.RESERVATION] + `/${entry.hotelId}`}
                                                    className="text-sm text-primary hover:underline whitespace-nowrap"
                                                >
                                                    Открыть шахматку
                                                </Link>
                                            )}
                                        </div>

                                        {hasDetails && (
                                            <button
                                                type="button"
                                                className="mt-2 text-sm text-primary hover:underline"
                                                onClick={() =>
                                                    setExpandedEntryId(isExpanded ? null : entry.id)
                                                }
                                            >
                                                {isExpanded ? 'Скрыть детали' : 'Показать детали'}
                                            </button>
                                        )}

                                        {isExpanded && (
                                            <ul className="mt-2 space-y-1 border-t pt-2 text-sm text-muted-foreground">
                                                {entry.changes.map((change) => (
                                                    <li key={`${entry.id}-${change.field}`}>
                                                        {formatReserveHistoryChangeLine(change)}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>

                        {entries.length > DASHBOARD_ACTIVITY_PAGE_SIZE && (
                            <Button
                                type="button"
                                variant="outline"
                                className={cn('w-full')}
                                onClick={() => setShowAll((value) => !value)}
                            >
                                {showAll
                                    ? 'Свернуть'
                                    : `Развернуть все (${entries.length})`}
                            </Button>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
