'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatReserveHistoryChangeLine } from '@/features/ReserveInfo/lib/formatReserveHistory';
import { cn } from '@/lib/utils';
import { Loader } from '@/shared';
import {
    OperationReserve,
    type OperationsCenterMode,
    useOperationsCenter,
    type OperationActivity,
    type OperationConflict,
    type OperationDuplicate,
    type OperationWebhookEvent,
} from '@/shared/api/operations/operationsCenter';
import {
    getReserveOverlaps,
    restoreDeletedReserveApi,
    type DeletedReserveItem,
    type ReserveOverlap,
} from '@/shared/api/reserve/reserve';
import { PagesEnum, routes } from '@/shared/config/routes';
import { parsePrepayment } from '@/shared/lib/parsePrepayment';
import { isStaffRole } from '@/shared/lib/userRoles';
import { $user } from '@/shared/models/auth';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useUnit } from 'effector-react';
import {
    AlertTriangle,
    ArrowRightLeft,
    CalendarCheck,
    CalendarClock,
    History,
    RefreshCw,
    Search,
    ShieldAlert,
    Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const toDateInputValue = (date?: Date) => (date ? dayjs(date).format('YYYY-MM-DD') : '');
const fromDateInputValue = (value: string) => (value ? dayjs(value).toDate() : undefined);

const formatDate = (unix: number) => dayjs.unix(unix).format('DD.MM');
const formatPeriod = (reserve: OperationReserve) =>
    `${formatDate(reserve.start)} - ${formatDate(reserve.end)}`;
const formatOverlapPeriod = (reserve: ReserveOverlap) =>
    `${formatDate(Number(reserve.start))} - ${formatDate(Number(reserve.end))}`;

const getPrepaymentLabel = (reserve: OperationReserve) => {
    const prepayment = parsePrepayment(reserve.prepayment);
    const balance = reserve.price - prepayment;

    if (balance <= 0 && reserve.price > 0) return 'Оплачено';
    if (prepayment > 0) return `Остаток ${balance.toLocaleString('ru-RU')} ₽`;
    return 'Нет предоплаты';
};

const ReserveList = ({
    title,
    description,
    reserves,
    emptyText,
}: {
    title: string;
    description?: string;
    reserves: OperationReserve[];
    emptyText: string;
}) => (
    <Card className="bg-white/90">
        <CardHeader className="p-4">
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
            {reserves.length === 0 && <p className="text-sm text-muted-foreground">{emptyText}</p>}
            {reserves.map((reserve) => (
                <Link
                    key={reserve.id}
                    href={`${routes[PagesEnum.RESERVATION]}/${reserve.hotelId ?? ''}`}
                    className="block rounded-lg border bg-white p-3 transition-colors hover:bg-muted/40"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{reserve.guest}</p>
                        <Badge variant={reserve.externalSource ? 'secondary' : 'outline'}>
                            {reserve.externalSource ? 'Интеграция' : 'Ручная'}
                        </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {reserve.hotelTitle} · {reserve.roomTitle} · {formatPeriod(reserve)}
                    </p>
                    <p className="mt-1 text-sm">
                        {reserve.phone || 'Без телефона'} · {getPrepaymentLabel(reserve)}
                    </p>
                </Link>
            ))}
        </CardContent>
    </Card>
);

const DuplicateList = ({ duplicates }: { duplicates: OperationDuplicate[] }) => (
    <Card className="bg-white/90">
        <CardHeader className="p-4">
            <CardTitle className="text-base">Дубликаты по телефону</CardTitle>
            <CardDescription>Гости с несколькими активными бронями.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
            {duplicates.length === 0 && (
                <p className="text-sm text-muted-foreground">Дубликатов не найдено.</p>
            )}
            {duplicates.map((group) => (
                <div key={group.phone} className="rounded-lg border bg-white p-3">
                    <p className="font-medium">+{group.phone}</p>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {group.reserves.slice(0, 4).map((reserve) => (
                            <p key={reserve.id}>
                                {reserve.guest} · {reserve.hotelTitle} · {formatPeriod(reserve)}
                            </p>
                        ))}
                    </div>
                </div>
            ))}
        </CardContent>
    </Card>
);

const ConflictList = ({ conflicts }: { conflicts: OperationConflict[] }) => (
    <Card className="bg-white/90">
        <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4 text-red-600" />
                Пересечения броней
            </CardTitle>
            <CardDescription>Пары броней в одной строке, которые пересекаются по датам.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
            {conflicts.length === 0 && (
                <p className="text-sm text-muted-foreground">Конфликтов не найдено.</p>
            )}
            {conflicts.map((conflict) => (
                <div
                    key={`${conflict.left.id}-${conflict.right.id}`}
                    className="rounded-lg border border-red-200 bg-red-50/80 p-3"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                            {conflict.hotelTitle} · {conflict.roomTitle}
                        </p>
                        {conflict.isExternalConflict && (
                            <Badge variant="destructive">Внешняя бронь</Badge>
                        )}
                    </div>
                    <p className="mt-2 text-sm">
                        {conflict.left.guest} ({formatPeriod(conflict.left)}) пересекается с{' '}
                        {conflict.right.guest} ({formatPeriod(conflict.right)})
                    </p>
                </div>
            ))}
        </CardContent>
    </Card>
);

const IntegrationEvents = ({ events }: { events: OperationWebhookEvent[] }) => (
    <Card className="bg-white/90">
        <CardHeader className="p-4">
            <CardTitle className="text-base">Логи RealtyCalendar</CardTitle>
            <CardDescription>Последние webhook-события, ошибки и конфликты интеграции.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
            {events.length === 0 && (
                <p className="text-sm text-muted-foreground">Логов интеграции пока нет.</p>
            )}
            {events.slice(0, 12).map((event) => {
                const isProblem = event.resultStatus !== 'success' || event.hasConflicts;

                return (
                    <div
                        key={event.id}
                        className={cn(
                            'rounded-lg border bg-white p-3',
                            isProblem && 'border-amber-200 bg-amber-50/80',
                        )}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">{event.action || 'Webhook'}</p>
                            <Badge variant={isProblem ? 'destructive' : 'outline'}>
                                {event.resultStatus}
                            </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {dayjs(event.receivedAt).format('DD.MM.YYYY HH:mm')}
                            {event.bookingId ? ` · booking ${event.bookingId}` : ''}
                        </p>
                        {event.resultReason && <p className="mt-1 text-sm">{event.resultReason}</p>}
                    </div>
                );
            })}
        </CardContent>
    </Card>
);

const ActivityList = ({ activity }: { activity: OperationActivity[] }) => (
    <Card className="bg-white/90">
        <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" />
                История действий
            </CardTitle>
            <CardDescription>
                Кто создал и изменил бронь, включая новые брони из интеграций.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
            {activity.length === 0 && (
                <p className="text-sm text-muted-foreground">История пока не заполнена.</p>
            )}
            {activity.slice(0, 20).map((entry) => (
                <div key={entry.id} className="rounded-lg border bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                            {entry.action === 'created' ? 'Создано' : 'Изменено'}
                        </p>
                        {entry.isIntegration && <Badge variant="secondary">Интеграция</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {dayjs(entry.changedAt).format('DD.MM.YYYY HH:mm')} ·{' '}
                        {entry.changedBy || 'Система'}
                    </p>
                    <p className="mt-1 text-sm">
                        {entry.hotelTitle} · {entry.roomTitle} · {entry.guest}
                    </p>
                    {entry.changes.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t pt-2 text-sm text-muted-foreground">
                            {entry.changes.slice(0, 4).map((change) => (
                                <li key={`${entry.id}-${change.field}`}>
                                    {formatReserveHistoryChangeLine(change)}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ))}
        </CardContent>
    </Card>
);

const DeletedReserves = ({
    deletedReserves,
    onRestore,
    isRestoring,
    checkingRestoreId,
}: {
    deletedReserves: DeletedReserveItem[];
    onRestore: (item: DeletedReserveItem) => void;
    isRestoring: boolean;
    checkingRestoreId?: string | null;
}) => (
    <Card className="bg-white/90">
        <CardHeader className="p-4">
            <CardTitle className="text-base">Удалённые брони</CardTitle>
            <CardDescription>
                Последние удаления. Можно восстановить, если бронь удалили ошибочно.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
            {deletedReserves.length === 0 && (
                <p className="text-sm text-muted-foreground">Удалённых броней для восстановления нет.</p>
            )}
            {deletedReserves.map((item) => {
                const reserve = item.reserve_data;
                const hotelTitle = item.hotel_data?.title ?? 'Без отеля';
                const roomTitle = item.room_data?.title ?? 'Без номера';
                const isChecking = checkingRestoreId === item.id;

                return (
                    <div key={item.id} className="rounded-lg border bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="font-medium">{reserve.guest || 'Без имени'}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {hotelTitle} · {roomTitle} · {formatDate(Number(reserve.start))} -{' '}
                                    {formatDate(Number(reserve.end))}
                                </p>
                                <p className="mt-1 text-sm">
                                    Удалено {dayjs(item.deleted_at).format('DD.MM.YYYY HH:mm')}
                                    {item.deleted_by ? ` · ${item.deleted_by}` : ''}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isRestoring || isChecking}
                                onClick={() => onRestore(item)}
                            >
                                {isChecking ? 'Проверяем...' : 'Восстановить'}
                            </Button>
                        </div>
                    </div>
                );
            })}
        </CardContent>
    </Card>
);

export const OperationsCenterPage = () => {
    const user = useUnit($user);
    const canView = isStaffRole(user?.role);
    const [query, setQuery] = useState('');
    const [activeMode, setActiveMode] = useState<OperationsCenterMode | null>(null);
    const [dateFrom, setDateFrom] = useState<Date | undefined>();
    const [dateTo, setDateTo] = useState<Date | undefined>();
    const [freeDateFrom, setFreeDateFrom] = useState<Date | undefined>();
    const [freeDateTo, setFreeDateTo] = useState<Date | undefined>();
    const [checkingRestoreId, setCheckingRestoreId] = useState<string | null>(null);
    const hasFreeDateRange = Boolean(freeDateFrom && freeDateTo);

    const requestedModes = useMemo(() => {
        const modes: OperationsCenterMode[] = [];

        if (query.trim() || dateFrom || dateTo) {
            modes.push('search');
        }

        if (activeMode && (activeMode !== 'freeRooms' || hasFreeDateRange)) {
            modes.push(activeMode);
        }

        return Array.from(new Set(modes));
    }, [activeMode, dateFrom, dateTo, hasFreeDateRange, query]);
    const hasSearchRequest = requestedModes.length > 0;
    const filters = useMemo(
        () => ({
            query,
            dateFrom,
            dateTo,
            freeDateFrom: activeMode === 'freeRooms' && hasFreeDateRange ? freeDateFrom : undefined,
            freeDateTo: activeMode === 'freeRooms' && hasFreeDateRange ? freeDateTo : undefined,
            modes: requestedModes,
        }),
        [
            activeMode,
            dateFrom,
            dateTo,
            freeDateFrom,
            freeDateTo,
            hasFreeDateRange,
            query,
            requestedModes,
        ],
    );
    const { data, isLoading, isError, error, refetch } = useOperationsCenter(
        filters,
        canView && hasSearchRequest,
    );
    const restoreMutation = useMutation({
        mutationFn: restoreDeletedReserveApi,
        onSuccess: async () => {
            showToast('Бронь восстановлена');
            await refetch();
        },
        onError: (restoreError) => {
            showToast(`Не удалось восстановить бронь: ${(restoreError as Error).message}`, 'error');
        },
    });

    const onRestoreReserve = async (item: DeletedReserveItem) => {
        const reserve = item.reserve_data;
        let allowOverlap = false;

        try {
            setCheckingRestoreId(item.id);
            const overlaps = await getReserveOverlaps({
                roomId: reserve.room_id,
                start: Number(reserve.start),
                end: Number(reserve.end),
            });

            if (overlaps.length > 0) {
                const overlapMessage = overlaps
                    .map(
                        (overlap) =>
                            `• ${overlap.guest || 'Без имени'}: ${formatOverlapPeriod(overlap)}${overlap.phone ? ` · ${overlap.phone}` : ''}`,
                    )
                    .join('\n');
                const shouldRestore = window.confirm(
                    `В номере уже есть бронь на эти даты:\n\n${overlapMessage}\n\nВсё равно восстановить удалённую бронь ${reserve.guest || 'Без имени'}?`,
                );

                if (!shouldRestore) return;
                allowOverlap = true;
            } else {
                const shouldRestore = window.confirm(
                    `Восстановить бронь ${reserve.guest || 'Без имени'} на ${formatDate(Number(reserve.start))} - ${formatDate(Number(reserve.end))}?`,
                );

                if (!shouldRestore) return;
            }
        } catch (overlapError) {
            showToast(
                `Не удалось проверить пересечения: ${(overlapError as Error).message}`,
                'error',
            );
            return;
        } finally {
            setCheckingRestoreId(null);
        }

        restoreMutation.mutate({
            deletedItemId: item.id,
            restoredBy: `${user?.name ?? ''} ${user?.surname ?? ''}`.trim() || user?.email,
            allowOverlap,
        });
    };

    const toggleMode = (mode: OperationsCenterMode) => {
        setActiveMode((currentMode) => (currentMode === mode ? null : mode));
    };

    const clearSearch = () => {
        setQuery('');
        setActiveMode(null);
        setDateFrom(undefined);
        setDateTo(undefined);
        setFreeDateFrom(undefined);
        setFreeDateTo(undefined);
    };

    if (!canView) {
        return (
            <Card className="mx-auto max-w-3xl bg-white/90">
                <CardHeader>
                    <CardTitle>Операционный центр</CardTitle>
                    <CardDescription>
                        Доступен только администраторам и операторам.
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-5 px-2 pb-8 sm:px-4">
            <div className="rounded-2xl border bg-white/90 p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Операционный центр</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Введите запрос или выберите быстрый режим — данные появятся только после
                            вашего действия.
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={!hasSearchRequest || isLoading}
                        onClick={() => refetch()}
                    >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Обновить результаты
                    </Button>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
                    <div className="space-y-2">
                        <Label htmlFor="operation-search">Поиск</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="operation-search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Гость, телефон, номер, отель, 30.06 или 2026-06-30"
                                className="pl-9"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Ищет по гостю, телефону, номеру, отелю и датам заезда/выезда.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                            <Label htmlFor="date-from">Брони с</Label>
                            <Input
                                id="date-from"
                                type="date"
                                value={toDateInputValue(dateFrom)}
                                onChange={(event) => setDateFrom(fromDateInputValue(event.target.value))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="date-to">по</Label>
                            <Input
                                id="date-to"
                                type="date"
                                value={toDateInputValue(dateTo)}
                                onChange={(event) => setDateTo(fromDateInputValue(event.target.value))}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                            <Label htmlFor="free-from">Свободно с</Label>
                            <Input
                                id="free-from"
                                type="date"
                                value={toDateInputValue(freeDateFrom)}
                                onChange={(event) =>
                                    setFreeDateFrom(fromDateInputValue(event.target.value))
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="free-to">по</Label>
                            <Input
                                id="free-to"
                                type="date"
                                value={toDateInputValue(freeDateTo)}
                                onChange={(event) =>
                                    setFreeDateTo(fromDateInputValue(event.target.value))
                                }
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    {[
                        ['arrivalsToday', 'Заезд сегодня', CalendarCheck],
                        ['departuresToday', 'Выезд сегодня', CalendarClock],
                        ['freeRooms', 'Свободно на даты', Sparkles],
                        ['duplicates', 'Дубликаты', ArrowRightLeft],
                        ['conflicts', 'Конфликты', AlertTriangle],
                        ['integrations', 'Интеграции', ShieldAlert],
                        ['deleted', 'Удалённые', History],
                    ].map(([mode, label, Icon]) => {
                        const quickMode = mode as OperationsCenterMode;
                        const QuickIcon = Icon as typeof CalendarCheck;

                        return (
                            <Button
                                key={quickMode}
                                type="button"
                                variant={activeMode === quickMode ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => toggleMode(quickMode)}
                            >
                                <QuickIcon className="mr-2 h-4 w-4" />
                                {String(label)}
                            </Button>
                        );
                    })}
                    <Button type="button" variant="ghost" size="sm" onClick={clearSearch}>
                        Очистить
                    </Button>
                </div>
            </div>

            {activeMode === 'freeRooms' && !hasFreeDateRange && (
                <Card className="bg-white/90">
                    <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">
                            Для поиска свободных номеров выберите обе даты: «Свободно с» и «по».
                        </p>
                    </CardContent>
                </Card>
            )}

            {hasSearchRequest && isLoading && (
                <div className="flex justify-center py-16">
                    <Loader />
                </div>
            )}

            {hasSearchRequest && isError && (
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="p-4">
                        <p className="text-sm text-red-700">
                            {(error as Error)?.message || 'Не удалось загрузить Операционный центр'}
                        </p>
                    </CardContent>
                </Card>
            )}

            {hasSearchRequest && data && (
                <>
                    {requestedModes.includes('search') && (
                        <ReserveList
                            title="Результаты поиска"
                            description="Гость, телефон, номер, отель и пересечение с выбранными датами."
                            reserves={data.searchResults}
                            emptyText="Ничего не найдено."
                        />
                    )}

                    {(activeMode === 'arrivalsToday' || activeMode === 'departuresToday') && (
                        <div className="grid gap-4 xl:grid-cols-2">
                            {activeMode === 'arrivalsToday' && (
                                <ReserveList
                                    title="Заезд сегодня"
                                    reserves={data.todayArrivals}
                                    emptyText="Заездов сегодня нет."
                                />
                            )}
                            {activeMode === 'departuresToday' && (
                                <ReserveList
                                    title="Выезд сегодня"
                                    reserves={data.todayDepartures}
                                    emptyText="Выездов сегодня нет."
                                />
                            )}
                        </div>
                    )}

                    {activeMode === 'freeRooms' && hasFreeDateRange && (
                        <Card className="bg-white/90">
                            <CardHeader className="p-4">
                                <CardTitle className="text-base">Свободные номера на даты</CardTitle>
                                <CardDescription>
                                    Показываем первые 80 свободных строк, чтобы экран не лагал.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-2 p-4 pt-0 sm:grid-cols-2 xl:grid-cols-3">
                                {data.freeRooms.length === 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        Свободных номеров не найдено.
                                    </p>
                                )}
                                {data.freeRooms.map((room) => (
                                    <div key={room.id} className="rounded-lg border bg-white p-3 text-sm">
                                        <p className="font-medium">{room.title}</p>
                                        <p className="text-muted-foreground">{room.hotelTitle}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    {(activeMode === 'duplicates' || activeMode === 'conflicts') && (
                        <div className="grid gap-4 xl:grid-cols-2">
                            {activeMode === 'duplicates' && (
                                <DuplicateList duplicates={data.duplicates} />
                            )}
                            {activeMode === 'conflicts' && <ConflictList conflicts={data.conflicts} />}
                        </div>
                    )}

                    {activeMode === 'integrations' && (
                        <>
                            <div className="grid gap-4 xl:grid-cols-2">
                                <ReserveList
                                    title="Новые брони из интеграций"
                                    reserves={data.externalNewBookings}
                                    emptyText="Новых внешних броней не найдено."
                                />
                                <IntegrationEvents events={data.integrationEvents} />
                            </div>

                            <ActivityList activity={data.activity} />
                        </>
                    )}

                    {activeMode === 'deleted' && (
                        <DeletedReserves
                            deletedReserves={data.deletedReserves}
                            isRestoring={restoreMutation.isPending}
                            checkingRestoreId={checkingRestoreId}
                            onRestore={onRestoreReserve}
                        />
                    )}
                </>
            )}
        </div>
    );
};
