'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isHotelierCabinetEnabled } from '@/shared/config/featureFlags';
import { $user } from '@/shared/models/auth';
import { useUnit } from 'effector-react/compat';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { DEFAULT_ACCOUNTING_START, useHotelierFinanceData } from '../api/finance';
import { buildStatement, dayFromIsoDate, formatDay, formatMoney, moscowDay, periodFor } from '../lib/finance';

type PeriodKind = 'week' | 'month';

/**
 * «Мои расчёты» — кабинет отельера. Видит только свои отели, и только те,
 * где Дарья включила показ. Нашу комиссию не видит: только свою долю,
 * выплаты и остаток.
 */
export const HotelierFinancePage = () => {
    const user = useUnit($user);
    const [today, setToday] = useState<number | null>(null);
    useEffect(() => {
        setToday(moscowDay(Math.floor(Date.now() / 1000)));
    }, []);
    const [kind, setKind] = useState<PeriodKind>('week');
    const [shift, setShift] = useState(0);
    const period = useMemo(() => (today === null ? null : periodFor(today, kind, shift)), [today, kind, shift]);

    // Начало учёта известно только из ответа функции; первый запрос — с даты по умолчанию.
    const [startDay, setStartDay] = useState(dayFromIsoDate(DEFAULT_ACCOUNTING_START));
    const { data, isPending, error } = useHotelierFinanceData(startDay, period?.toDay ?? 0, period !== null);
    useEffect(() => {
        if (data?.accounting_start && /^\d{4}-\d{2}-\d{2}/.test(data.accounting_start)) {
            const day = dayFromIsoDate(data.accounting_start);
            if (day !== startDay) setStartDay(day);
        }
    }, [data?.accounting_start, startDay]);

    const rows = useMemo(
        () =>
            data && period
                ? buildStatement({
                      reserves: data.reserves,
                      hotels: data.hotels,
                      terms: data.terms,
                      payouts: data.payouts,
                      adjustments: data.adjustments,
                      startDay,
                      fromDay: period.fromDay,
                      toDay: period.toDay,
                  })
                : [],
        [data, period, startDay],
    );

    if (!isHotelierCabinetEnabled(user?.role)) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Мои расчёты</CardTitle>
                    <CardDescription>Раздел для отельеров.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="mx-auto max-w-5xl space-y-4 px-2 pb-8 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/90 p-4 shadow-sm">
                <div>
                    <h1 className="text-2xl font-semibold">Мои расчёты</h1>
                    <p className="text-sm text-muted-foreground">
                        Брони по выезду гостей, ваша доля из предоплаты, выплаты и остаток. Учёт с {formatDay(startDay)}.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={kind} onValueChange={(v) => { setKind(v as PeriodKind); setShift(0); }}>
                        <SelectTrigger className="w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="week">Неделя</SelectItem>
                            <SelectItem value="month">Месяц</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShift((s) => s - 1)}>
                        <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-sm">{period ? `${formatDay(period.fromDay)} – ${formatDay(period.toDay)}` : ''}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShift((s) => s + 1)}>
                        <ChevronRight className="size-4" />
                    </Button>
                </div>
            </div>

            {error && <p className="text-sm text-destructive">Не удалось загрузить: {error instanceof Error ? error.message : 'ошибка'}</p>}
            {isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}
            {data && data.hotels.length === 0 && (
                <Card>
                    <CardContent className="p-4 text-sm text-muted-foreground">
                        Для ваших отелей расчёты ещё не открыты. Напишите Дарье — она включит доступ после согласования условий.
                    </CardContent>
                </Card>
            )}

            {rows.map((row) => (
                <Card key={row.hotelId} className="bg-white/90">
                    <CardHeader className="p-4">
                        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                            <span>{row.hotelTitle}</span>
                            <Badge variant={row.balance > 0 ? 'destructive' : row.balance < 0 ? 'secondary' : 'outline'}>
                                {row.balance > 0
                                    ? `к выплате вам ${formatMoney(row.balance)}`
                                    : row.balance < 0
                                      ? `вы должны ${formatMoney(-row.balance)}`
                                      : 'остаток 0 ₽'}
                            </Badge>
                        </CardTitle>
                        <CardDescription>
                            За период: броней {row.bookingsCount}, ваша доля {formatMoney(row.weOweHotel)}
                            {row.hotelOwesUs > 0 ? `, наша доля с ваших предоплат ${formatMoney(row.hotelOwesUs)}` : ''}, выплачено{' '}
                            {formatMoney(row.paid)}. Остаток — накопленный с начала учёта.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1 p-4 pt-0 text-sm">
                        {row.bookings.length === 0 && <p className="text-muted-foreground">В этом периоде выездов нет.</p>}
                        {row.bookings.map((b) => (
                            <div key={b.reserve.id} className="flex flex-wrap gap-3 border-b py-1 last:border-0">
                                <span className="w-52 font-medium">{b.reserve.guest}</span>
                                <span>{b.reserve.rooms?.title}</span>
                                <span>
                                    {formatDay(moscowDay(b.reserve.start))} – {formatDay(moscowDay(b.reserve.end))} ({b.nights} н.)
                                </span>
                                <span>на месте {formatMoney(b.toPayOnSite)}</span>
                                {b.weOweHotel > 0 && <span>ваша доля {formatMoney(b.weOweHotel)}</span>}
                                {b.hotelOwesUs > 0 && <span>наша доля {formatMoney(b.hotelOwesUs)}</span>}
                            </div>
                        ))}
                        {data?.payouts
                            .filter((p) => p.hotel_id === row.hotelId && period && p.paid_at >= formatIso(period.fromDay) && p.paid_at <= formatIso(period.toDay))
                            .map((p) => (
                                <div key={p.id} className="flex flex-wrap gap-3 text-green-800">
                                    <span className="w-52">Выплата {p.paid_at}</span>
                                    <span>{formatMoney(Number(p.amount))}</span>
                                    <span>{p.method ?? ''}</span>
                                    <span>{p.comment ?? ''}</span>
                                </div>
                            ))}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};

const formatIso = (day: number) => new Date(day * 86400 * 1000).toISOString().slice(0, 10);
