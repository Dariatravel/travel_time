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

import { useHotelierFinanceData } from '../api/finance';
import {
    buildStatement,
    dayFromIsoDate,
    formatDay,
    formatMoney,
    isoDateFromDay,
    moscowDay,
    periodFor,
    type HotelTermsRow,
} from '../lib/finance';

type PeriodKind = 'week' | 'month';

/**
 * «Мои расчёты» — кабинет отельера. Видит только свои отели, и только те,
 * где Дарья включила показ: свою долю, выплаты, корректировки и остаток.
 * Нашу комиссию явно не показываем.
 */
export const HotelierFinancePage = () => {
    const user = useUnit($user);
    const allowed = isHotelierCabinetEnabled(user?.role);
    const [today, setToday] = useState<number | null>(null);
    useEffect(() => {
        setToday(moscowDay(Math.floor(Date.now() / 1000)));
    }, []);
    const [kind, setKind] = useState<PeriodKind>('week');
    const [shift, setShift] = useState(0);
    const period = useMemo(() => (today === null ? null : periodFor(today, kind, shift)), [today, kind, shift]);

    const { data, isPending, error } = useHotelierFinanceData(period?.toDay ?? 0, allowed && period !== null);
    const startDay = data ? dayFromIsoDate(data.accounting_start) : null;

    const rows = useMemo(() => {
        if (!data || !period || startDay === null) return [];
        const terms: HotelTermsRow[] = data.terms.map((t) => ({
            ...t,
            payout_period: 'week',
            min_nights: null,
            deposit_note: null,
            note: null,
        }));

        return buildStatement({
            reserves: data.reserves,
            hotels: data.hotels,
            terms,
            payouts: data.payouts,
            adjustments: data.adjustments,
            startDay,
            fromDay: period.fromDay,
            toDay: period.toDay,
        });
    }, [data, period, startDay]);

    if (!allowed) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Мои расчёты</CardTitle>
                    <CardDescription>Раздел для отельеров.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const inPeriod = (iso: string) => !!period && iso >= isoDateFromDay(period.fromDay) && iso <= isoDateFromDay(period.toDay);

    return (
        <div className="mx-auto max-w-5xl space-y-4 px-2 pb-8 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/90 p-4 shadow-sm">
                <div>
                    <h1 className="text-2xl font-semibold">Мои расчёты</h1>
                    <p className="text-sm text-muted-foreground">
                        Брони по выезду гостей, ваша доля из предоплаты, выплаты и остаток
                        {startDay !== null ? `. Учёт с ${formatDay(startDay)}` : ''}.
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
                            <Badge variant={row.balance > 0 ? 'default' : row.balance < 0 ? 'destructive' : 'outline'}>
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
                            .filter((p) => p.hotel_id === row.hotelId && inPeriod(p.paid_at))
                            .map((p) => (
                                <div key={p.id} className="flex flex-wrap gap-3 text-green-800">
                                    <span className="w-52">Выплата {p.paid_at}</span>
                                    <span>{formatMoney(Number(p.amount))}</span>
                                    <span>{p.method ?? ''}</span>
                                </div>
                            ))}
                        {data?.adjustments
                            .filter((a) => a.hotel_id === row.hotelId && inPeriod(a.date))
                            .map((a) => (
                                <div key={a.id} className="flex flex-wrap gap-3 text-amber-800">
                                    <span className="w-52">Корректировка {a.date}</span>
                                    <span>{a.direction === 'we_owe_hotel' ? `+${formatMoney(Number(a.amount))} вам` : `−${formatMoney(Number(a.amount))}`}</span>
                                </div>
                            ))}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};
