'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isFinanceEnabled } from '@/shared/config/featureFlags';
import { $user } from '@/shared/models/auth';
import { TravelDialog } from '@/shared/ui/TravelDialog/TravelDialog';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useUnit } from 'effector-react/compat';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { FC, Fragment, useEffect, useMemo, useState } from 'react';

import {
    useAddAdjustment,
    useAddPayout,
    useAdjustments,
    useDeleteFinanceRow,
    useFinanceReserves,
    useHotelTerms,
    usePaymentDetails,
    usePayouts,
    useSaveTerms,
} from '../api/finance';
import {
    buildStatement,
    formatDay,
    formatMoney,
    isoDateFromDay,
    moscowDay,
    periodFor,
    TERMS_MODEL_LABELS,
    totals,
    type HotelSummary,
    type TermsModel,
} from '../lib/finance';

type PeriodKind = 'week' | 'month';

const numberOrNull = (value: string): number | null => {
    if (value.trim() === '') return null;
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));

    return Number.isFinite(parsed) ? parsed : null;
};

/** Условия с отелем + реквизиты — одно окно. */
const TermsDialog: FC<{ hotel: HotelSummary; actor: string; onClose: () => void }> = ({ hotel, actor, onClose }) => {
    const save = useSaveTerms();
    const { data: details } = usePaymentDetails(hotel.hotelId);
    const [form, setForm] = useState({
        model: (hotel.terms?.model ?? 'prepay_is_fee') as TermsModel,
        hotel_share_pct: hotel.terms?.hotel_share_pct == null ? '' : String(hotel.terms.hotel_share_pct),
        fixed_amount: hotel.terms?.fixed_amount == null ? '' : String(hotel.terms.fixed_amount),
        prepay_direct_to_hotel: hotel.terms?.prepay_direct_to_hotel ?? false,
        payout_period: hotel.terms?.payout_period ?? 'week',
        min_nights: hotel.terms?.min_nights == null ? '' : String(hotel.terms.min_nights),
        deposit_note: hotel.terms?.deposit_note ?? '',
        note: hotel.terms?.note ?? '',
        bank: '',
        holder: '',
        requisites: '',
    });
    useEffect(() => {
        if (details) setForm((f) => ({ ...f, bank: details.bank ?? '', holder: details.holder ?? '', requisites: details.requisites ?? '' }));
    }, [details]);
    const set = (key: keyof typeof form) => (value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

    return (
        <TravelDialog
            isOpen
            onClose={onClose}
            title={`Условия: ${hotel.hotelTitle}`}
            description={
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label>Как делится предоплата</Label>
                        <Select value={form.model} onValueChange={(v) => set('model')(v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(TERMS_MODEL_LABELS) as TermsModel[]).map((key) => (
                                    <SelectItem key={key} value={key}>
                                        {TERMS_MODEL_LABELS[key]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {form.model === 'share_pct' && (
                        <div className="space-y-1">
                            <Label>Процент отелю от предоплаты</Label>
                            <Input type="number" value={form.hotel_share_pct} onChange={(e) => set('hotel_share_pct')(e.target.value)} />
                        </div>
                    )}
                    {(form.model === 'fixed_per_booking' || form.model === 'fixed_per_night') && (
                        <div className="space-y-1">
                            <Label>{form.model === 'fixed_per_booking' ? 'Наш фикс за бронь, ₽' : 'Наш фикс за ночь, ₽'}</Label>
                            <Input type="number" value={form.fixed_amount} onChange={(e) => set('fixed_amount')(e.target.value)} />
                        </div>
                    )}
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={form.prepay_direct_to_hotel} onChange={(e) => set('prepay_direct_to_hotel')(e.target.checked)} />
                        Доверенный отель: клиент платит предоплату сразу отелю (тогда отель должен нам нашу долю)
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                            <Label>Период расчётов</Label>
                            <Select value={form.payout_period} onValueChange={(v) => set('payout_period')(v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="week">Раз в неделю</SelectItem>
                                    <SelectItem value="month">Раз в месяц</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Бронь от N ночей</Label>
                            <Input type="number" value={form.min_nights} onChange={(e) => set('min_nights')(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label>Депозит / условия отмены (текстом)</Label>
                        <Input value={form.deposit_note} onChange={(e) => set('deposit_note')(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label>Заметка</Label>
                        <Textarea rows={2} value={form.note} onChange={(e) => set('note')(e.target.value)} />
                    </div>
                    <div className="rounded-lg border p-3">
                        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Куда переводить отелю</div>
                        <div className="grid gap-2 sm:grid-cols-3">
                            <div className="space-y-1">
                                <Label>Банк</Label>
                                <Input value={form.bank} onChange={(e) => set('bank')(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <Label>Получатель</Label>
                                <Input value={form.holder} onChange={(e) => set('holder')(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <Label>Телефон СБП / карта</Label>
                                <Input value={form.requisites} onChange={(e) => set('requisites')(e.target.value)} />
                            </div>
                        </div>
                    </div>
                </div>
            }
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Закрыть
                    </Button>
                    <Button
                        type="button"
                        disabled={save.isPending}
                        onClick={() =>
                            save
                                .mutateAsync({
                                    terms: {
                                        hotel_id: hotel.hotelId,
                                        model: form.model,
                                        hotel_share_pct: numberOrNull(form.hotel_share_pct),
                                        fixed_amount: numberOrNull(form.fixed_amount),
                                        prepay_direct_to_hotel: form.prepay_direct_to_hotel,
                                        payout_period: form.payout_period as 'week' | 'month',
                                        min_nights: numberOrNull(form.min_nights),
                                        deposit_note: form.deposit_note || null,
                                        note: form.note || null,
                                    },
                                    details: { bank: form.bank || null, holder: form.holder || null, requisites: form.requisites || null },
                                    actor,
                                })
                                .then(() => {
                                    showToast('Условия сохранены', 'success');
                                    onClose();
                                })
                                .catch((e: unknown) => showToast(e instanceof Error ? e.message : 'Не сохранилось', 'error'))
                        }
                    >
                        Сохранить
                    </Button>
                </>
            }
        />
    );
};

const MoneyDialog: FC<{
    kind: 'payout' | 'adjustment';
    hotel: HotelSummary;
    actor: string;
    todayIso: string;
    onClose: () => void;
}> = ({ kind, hotel, actor, todayIso, onClose }) => {
    const addPayout = useAddPayout();
    const addAdjustment = useAddAdjustment();
    const [form, setForm] = useState({ date: todayIso, amount: '', method: 'СБП', direction: 'we_owe_hotel', comment: '' });
    const busy = addPayout.isPending || addAdjustment.isPending;

    const submit = async () => {
        const amount = numberOrNull(form.amount);
        if (!amount || amount <= 0) {
            showToast('Введите сумму', 'error');

            return;
        }
        try {
            if (kind === 'payout') {
                await addPayout.mutateAsync({ hotel_id: hotel.hotelId, paid_at: form.date, amount, method: form.method || null, comment: form.comment || null, created_by: actor });
            } else {
                await addAdjustment.mutateAsync({
                    hotel_id: hotel.hotelId,
                    reserve_id: null,
                    date: form.date,
                    direction: form.direction as 'we_owe_hotel' | 'hotel_owes_us',
                    amount,
                    comment: form.comment || null,
                    created_by: actor,
                });
            }
            showToast(kind === 'payout' ? 'Выплата записана' : 'Корректировка записана', 'success');
            onClose();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Не сохранилось', 'error');
        }
    };

    return (
        <TravelDialog
            isOpen
            onClose={onClose}
            title={kind === 'payout' ? `Выплата отелю: ${hotel.hotelTitle}` : `Корректировка: ${hotel.hotelTitle}`}
            description={
                <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                            <Label>Дата</Label>
                            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Сумма, ₽</Label>
                            <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
                        </div>
                    </div>
                    {kind === 'payout' ? (
                        <div className="space-y-1">
                            <Label>Способ</Label>
                            <Input value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} />
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <Label>Направление</Label>
                            <Select value={form.direction} onValueChange={(v) => setForm((f) => ({ ...f, direction: v }))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="we_owe_hotel">Мы должны отелю</SelectItem>
                                    <SelectItem value="hotel_owes_us">Отель должен нам</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label>Комментарий (бронь, гость, за что)</Label>
                        <Input value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} />
                    </div>
                    <p className="text-xs text-muted-foreground">Деньги переводит человек. Здесь только запись о том, что перевод сделан.</p>
                </div>
            }
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Отмена
                    </Button>
                    <Button type="button" disabled={busy} onClick={submit}>
                        Записать
                    </Button>
                </>
            }
        />
    );
};

/**
 * Финансы с отелями: ведомость за неделю/месяц по выезду гостей, условия по
 * каждому отелю, выплаты и корректировки. Доступ — только admin.
 */
export const FinancePage = () => {
    const user = useUnit($user);
    const actor = [user?.name, user?.surname].filter(Boolean).join(' ') || 'Дарья';
    const [today, setToday] = useState<number | null>(null);
    useEffect(() => {
        setToday(moscowDay(Math.floor(Date.now() / 1000)));
    }, []);
    const [kind, setKind] = useState<PeriodKind>('week');
    const [shift, setShift] = useState(0);
    const period = useMemo(() => (today === null ? null : periodFor(today, kind, shift)), [today, kind, shift]);

    const { data: reserves = [], isPending, error } = useFinanceReserves(period?.fromDay ?? 0, period?.toDay ?? 0);
    const { data: terms = [] } = useHotelTerms();
    const { data: payouts = [] } = usePayouts();
    const { data: adjustments = [] } = useAdjustments();
    const remove = useDeleteFinanceRow();

    const [expanded, setExpanded] = useState<string | null>(null);
    const [dialog, setDialog] = useState<{ kind: 'terms' | 'payout' | 'adjustment'; hotel: HotelSummary } | null>(null);

    const rows = useMemo(
        () => (period ? buildStatement({ reserves, terms, payouts, adjustments, fromDay: period.fromDay, toDay: period.toDay }) : []),
        [reserves, terms, payouts, adjustments, period],
    );
    const sum = useMemo(() => totals(rows), [rows]);
    const unknownTerms = rows.filter((r) => !r.terms).length;

    if (!isFinanceEnabled(user?.role)) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Финансы</CardTitle>
                    <CardDescription>Раздел открыт только администратору.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-4 px-2 pb-8 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/90 p-4 shadow-sm">
                <div>
                    <h1 className="text-2xl font-semibold">Финансы с отелями</h1>
                    <p className="text-sm text-muted-foreground">
                        Ведомость по выезду гостей. Условия по каждому отелю задаются в его строке; без условий вся предоплата считается нашей.
                    </p>
                </div>
                <div className="flex items-center gap-2">
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

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {[
                    ['Броней', String(sum.bookingsCount)],
                    ['Оборот', formatMoney(sum.gross)],
                    ['Предоплаты', formatMoney(sum.prepaid)],
                    ['Наше', formatMoney(sum.ourFee)],
                    ['Должны отелям', formatMoney(sum.weOweHotel)],
                    ['Отели должны нам', formatMoney(sum.hotelOwesUs)],
                    ['Выплачено', formatMoney(sum.paid)],
                ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border bg-white/90 p-3">
                        <div className="text-lg font-semibold">{value}</div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                    </div>
                ))}
            </div>
            {unknownTerms > 0 && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                    У {unknownTerms} отелей условия не заданы — их предоплата пока целиком считается нашей. Нажмите «Условия» в строке отеля.
                </p>
            )}

            <Card className="bg-white/90">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                                    <th className="p-3">Отель</th>
                                    <th className="p-3 text-right">Броней</th>
                                    <th className="p-3 text-right">Оборот</th>
                                    <th className="p-3 text-right">Предоплаты</th>
                                    <th className="p-3 text-right">Наше</th>
                                    <th className="p-3 text-right">Отелю</th>
                                    <th className="p-3 text-right">Выплачено</th>
                                    <th className="p-3 text-right">Остаток</th>
                                    <th className="p-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 && !isPending && (
                                    <tr>
                                        <td className="p-3 text-muted-foreground" colSpan={9}>
                                            В этом периоде выездов нет.
                                        </td>
                                    </tr>
                                )}
                                {rows.map((row) => (
                                    <Fragment key={row.hotelId}>
                                        <tr className="border-b">
                                            <td className="p-3">
                                                <button type="button" className="flex items-center gap-1 font-medium" onClick={() => setExpanded(expanded === row.hotelId ? null : row.hotelId)}>
                                                    {expanded === row.hotelId ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                                                    {row.hotelTitle}
                                                </button>
                                                <div className="text-xs text-muted-foreground">
                                                    {row.terms ? TERMS_MODEL_LABELS[row.terms.model] : 'условия не заданы'}
                                                    {row.terms?.prepay_direct_to_hotel ? ' · предоплата напрямую в отель' : ''}
                                                </div>
                                            </td>
                                            <td className="p-3 text-right">{row.bookingsCount}</td>
                                            <td className="p-3 text-right">{formatMoney(row.gross)}</td>
                                            <td className="p-3 text-right">{formatMoney(row.prepaid)}</td>
                                            <td className="p-3 text-right">{formatMoney(row.ourFee)}</td>
                                            <td className="p-3 text-right">
                                                {formatMoney(row.weOweHotel + row.adjustmentsWeOwe - row.hotelOwesUs - row.adjustmentsHotelOwes)}
                                            </td>
                                            <td className="p-3 text-right">{formatMoney(row.paid)}</td>
                                            <td className="p-3 text-right font-semibold">
                                                <Badge variant={row.balance > 0 ? 'destructive' : row.balance < 0 ? 'secondary' : 'outline'}>
                                                    {formatMoney(row.balance)}
                                                </Badge>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex flex-wrap justify-end gap-1">
                                                    <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: 'terms', hotel: row })}>
                                                        Условия
                                                    </Button>
                                                    <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: 'payout', hotel: row })}>
                                                        Выплата
                                                    </Button>
                                                    <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ kind: 'adjustment', hotel: row })}>
                                                        Корректировка
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                        {expanded === row.hotelId && (
                                            <tr className="border-b bg-muted/30">
                                                <td className="p-3" colSpan={9}>
                                                    <div className="space-y-1 text-xs">
                                                        {row.bookings.map((b) => (
                                                            <div key={b.reserve.id} className="flex flex-wrap gap-3">
                                                                <span className="w-56 font-medium">{b.reserve.guest}</span>
                                                                <span>{b.reserve.rooms?.title}</span>
                                                                <span>
                                                                    {formatDay(moscowDay(b.reserve.start))} – {formatDay(moscowDay(b.reserve.end))} ({b.nights} н.)
                                                                </span>
                                                                <span>оборот {formatMoney(b.gross)}</span>
                                                                <span>предоплата {formatMoney(b.prepaid)}</span>
                                                                <span>наше {formatMoney(b.ourFee)}</span>
                                                                <span>отелю {formatMoney(b.weOweHotel)}</span>
                                                                {b.hotelOwesUs > 0 && <span>отель должен нам {formatMoney(b.hotelOwesUs)}</span>}
                                                            </div>
                                                        ))}
                                                        {payouts
                                                            .filter((p) => p.hotel_id === row.hotelId && period && p.paid_at >= isoDateFromDay(period.fromDay) && p.paid_at <= isoDateFromDay(period.toDay))
                                                            .map((p) => (
                                                                <div key={p.id} className="flex flex-wrap gap-3 text-green-800">
                                                                    <span className="w-56">Выплата {p.paid_at}</span>
                                                                    <span>{formatMoney(Number(p.amount))}</span>
                                                                    <span>{p.method ?? ''}</span>
                                                                    <span>{p.comment ?? ''}</span>
                                                                    <button type="button" className="underline" onClick={() => window.confirm('Удалить запись о выплате?') && remove.mutate({ table: 'payouts', id: p.id })}>
                                                                        удалить
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        {adjustments
                                                            .filter((a) => a.hotel_id === row.hotelId && period && a.date >= isoDateFromDay(period.fromDay) && a.date <= isoDateFromDay(period.toDay))
                                                            .map((a) => (
                                                                <div key={a.id} className="flex flex-wrap gap-3 text-amber-800">
                                                                    <span className="w-56">Корректировка {a.date}</span>
                                                                    <span>{a.direction === 'we_owe_hotel' ? 'мы должны отелю' : 'отель должен нам'}</span>
                                                                    <span>{formatMoney(Number(a.amount))}</span>
                                                                    <span>{a.comment ?? ''}</span>
                                                                    <button type="button" className="underline" onClick={() => window.confirm('Удалить корректировку?') && remove.mutate({ table: 'finance_adjustments', id: a.id })}>
                                                                        удалить
                                                                    </button>
                                                                </div>
                                                            ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {dialog?.kind === 'terms' && <TermsDialog hotel={dialog.hotel} actor={actor} onClose={() => setDialog(null)} />}
            {dialog && dialog.kind !== 'terms' && today !== null && (
                <MoneyDialog kind={dialog.kind} hotel={dialog.hotel} actor={actor} todayIso={isoDateFromDay(today)} onClose={() => setDialog(null)} />
            )}
        </div>
    );
};
