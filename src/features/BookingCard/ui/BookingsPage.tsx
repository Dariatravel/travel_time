'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CurrentReserveType } from '@/shared/api/reserve/reserve';
import { isBookingCardEnabled } from '@/shared/config/featureFlags';
import { $user } from '@/shared/models/auth';
import { useUnit } from 'effector-react/compat';
import { Check, Circle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { cardOfRow, useBookingList, type BookingListRow } from '../api/bookingCard';
import {
    BOOKING_STATUS_LABELS,
    BOOKING_STEP_LABELS,
    bookingSteps,
    formatMoscowDate,
    missingSteps,
    type BookingStatus,
    type BookingStep,
} from '../lib/voucher';
import { BookingCardModal } from './BookingCardModal';

const STEP_ORDER: BookingStep[] = ['voucher', 'chat', 'chessmate', 'hotel'];
const DAY = 86400;

type Filter = 'incomplete' | 'all' | BookingStatus;

const FILTERS: { key: Filter; label: string }[] = [
    { key: 'incomplete', label: 'Незавершённые' },
    { key: 'all', label: 'Все' },
    { key: 'booked', label: 'Бронь' },
    { key: 'changed', label: 'Изменённые' },
    { key: 'transferred', label: 'Перенесённые' },
    { key: 'cancelled', label: 'Отменённые' },
];

const toCurrentReserve = (row: BookingListRow): CurrentReserveType => ({
    reserve: {
        id: row.id,
        room_id: row.rooms?.id ?? '',
        guest: row.guest,
        phone: row.phone,
        start: row.start,
        end: row.end,
        price: row.price,
        quantity: row.quantity,
        prepayment: row.prepayment,
        comment: row.comment ?? undefined,
        created_at: row.created_at ?? undefined,
    },
    room: row.rooms ? { id: row.rooms.id, title: row.rooms.title } : null,
    hotel: row.rooms?.hotels
        ? {
              id: row.rooms.hotels.id,
              title: row.rooms.hotels.title,
              type: row.rooms.hotels.type ?? '',
              address: row.rooms.hotels.address ?? '',
              phone: row.rooms.hotels.phone ?? '',
          }
        : null,
} as CurrentReserveType);

/**
 * Страница «Брони»: список броней с чек-листом четырёх действий.
 * Главный экран — «Незавершённые»: по ним видно, где менеджер забыл шаг.
 */
export const BookingsPage = () => {
    const user = useUnit($user);
    const [filter, setFilter] = useState<Filter>('incomplete');
    const [selected, setSelected] = useState<BookingListRow | null>(null);

    // Брони с заездом от «вчера» и позже; прошлое в чек-листе не нужно.
    // Момент «сейчас» берём после монтирования — правило линтера о чистом рендере.
    const [fromUnix, setFromUnix] = useState<number | null>(null);
    useEffect(() => {
        setFromUnix(Math.floor(Date.now() / 1000) - DAY);
    }, []);
    const statusFilter = filter === 'incomplete' || filter === 'all' ? 'all' : filter;
    const { data: rows = [], isPending, error } = useBookingList(fromUnix ?? 0, statusFilter, fromUnix !== null);

    const visibleRows = useMemo(() => {
        if (filter !== 'incomplete') return rows;

        return rows.filter((row) => {
            const card = cardOfRow(row);
            if (card?.status === 'cancelled') return false;

            return missingSteps(bookingSteps(card, row.created_at)).length > 0;
        });
    }, [rows, filter]);

    if (!isBookingCardEnabled(user?.role)) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Брони</CardTitle>
                    <CardDescription>Раздел пока открыт только администратору.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Брони</CardTitle>
                    <CardDescription>
                        Одна бронь — четыре действия: ваучер, файл с #бронь в чат, шахматка,
                        отельеру. Здесь видно, что ещё не сделано.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {FILTERS.map((item) => (
                            <Button
                                key={item.key}
                                type="button"
                                size="sm"
                                variant={filter === item.key ? 'default' : 'outline'}
                                onClick={() => setFilter(item.key)}
                            >
                                {item.label}
                            </Button>
                        ))}
                    </div>

                    {error && (
                        <div className="text-sm text-destructive">
                            Не удалось загрузить: {error instanceof Error ? error.message : 'ошибка'}
                        </div>
                    )}
                    {isPending && <div className="text-sm text-muted-foreground">Загрузка…</div>}
                    {!isPending && visibleRows.length === 0 && (
                        <div className="text-sm text-muted-foreground">
                            {filter === 'incomplete' ? 'Всё сделано — незавершённых броней нет.' : 'Пусто.'}
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                                    <th className="py-2 pr-3">Гость</th>
                                    <th className="py-2 pr-3">Отель / номер</th>
                                    <th className="py-2 pr-3">Даты</th>
                                    <th className="py-2 pr-3">Статус</th>
                                    {STEP_ORDER.map((step) => (
                                        <th key={step} className="py-2 pr-3 font-normal">
                                            {BOOKING_STEP_LABELS[step]}
                                        </th>
                                    ))}
                                    <th className="py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map((row) => {
                                    const card = cardOfRow(row);
                                    const steps = bookingSteps(card, row.created_at);
                                    const status = card?.status ?? 'booked';

                                    return (
                                        <tr key={row.id} className="border-b align-top">
                                            <td className="py-2 pr-3">
                                                <div className="font-medium">{row.guest}</div>
                                                {card?.manager && (
                                                    <div className="text-xs text-muted-foreground">
                                                        {card.manager}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-2 pr-3">
                                                <div>{row.rooms?.hotels?.title ?? '—'}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {row.rooms?.title ?? ''}
                                                </div>
                                            </td>
                                            <td className="py-2 pr-3 whitespace-nowrap">
                                                {formatMoscowDate(row.start)} – {formatMoscowDate(row.end)}
                                            </td>
                                            <td className="py-2 pr-3">
                                                <Badge
                                                    variant={
                                                        status === 'cancelled'
                                                            ? 'destructive'
                                                            : status === 'booked'
                                                              ? 'default'
                                                              : 'secondary'
                                                    }
                                                >
                                                    {BOOKING_STATUS_LABELS[status]}
                                                </Badge>
                                            </td>
                                            {STEP_ORDER.map((step) => (
                                                <td key={step} className="py-2 pr-3">
                                                    {steps[step] ? (
                                                        <Check className="size-4 text-green-600" />
                                                    ) : (
                                                        <Circle className="size-4 text-muted-foreground" />
                                                    )}
                                                </td>
                                            ))}
                                            <td className="py-2 text-right">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={!row.rooms?.hotels}
                                                    onClick={() => setSelected(row)}
                                                >
                                                    Открыть
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {selected && (
                <BookingCardModal
                    isOpen={!!selected}
                    onClose={() => setSelected(null)}
                    currentReserve={toCurrentReserve(selected)}
                />
            )}
        </div>
    );
};
