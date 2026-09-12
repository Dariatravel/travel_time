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
    useAccountingStart,
    useAddAdjustment,
    useAddPayout,
    useAdjustments,
    useFinanceHotels,
    useFinanceReserves,
    useHotelTerms,
    usePaymentDetails,
    usePayouts,
    useSaveAccountingStart,
    useSaveTerms,
    useSoftDeleteFinanceRow,
    type PaymentDetails,
} from '../api/finance';
import {
    buildStatement,
    dayFromIsoDate,
    formatDay,
    formatMoney,
    isoDateFromDay,
    moscowDay,
    periodFor,
    TERMS_MODEL_LABELS,
    totals,
    validateTerms,
    type HotelRef,
    type HotelTermsRow,
    type TermsModel,
} from '../lib/finance';

type PeriodKind = 'week' | 'month';

const numberOrNull = (value: string): number | null => {
    if (value.trim() === '') return null;
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));

    return Number.isFinite(parsed) ? parsed : null;
};

/** Форма условий — рендерится только когда реквизиты загружены, чтобы ввод не затирался. */
const TermsForm: FC<{
    hotel: HotelRef;
    terms: HotelTermsRow | null;
    details: PaymentDetails | null;
    actor: string;
    onClose: () => void;
}> = ({ hotel, terms, details, actor, onClose }) => {
    const save = useSaveTerms();
    const [form, setForm] = useState({
        model: (terms?.model ?? 'prepay_is_fee') as TermsModel,
        hotel_share_pct: terms?.hotel_share_pct == null ? '' : String(terms.hotel_share_pct),
        fixed_amount: terms?.fixed_amount == null ? '' : String(terms.fixed_amount),
        prepay_direct_to_hotel: terms?.prepay_direct_to_hotel ?? false,
        payout_period: terms?.payout_period ?? 'week',
        min_nights: terms?.min_nights == null ? '' : String(terms.min_nights),
        deposit_note: terms?.deposit_note ?? '',
        note: terms?.note ?? '',
        hotelier_visible: terms?.hotelier_visible ?? false,
        bank: details?.bank ?? '',
        holder: details?.holder ?? '',
        requisites: details?.requisites ?? '',
    });
    const set = (key: keyof typeof form) => (value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

    const onSave = async () => {
        const next = {
            hotel_id: hotel.id,
            model: form.model,
            hotel_share_pct: numberOrNull(form.hotel_share_pct),
            fixed_amount: numberOrNull(form.fixed_amount),
            prepay_direct_to_hotel: form.prepay_direct_to_hotel,
            payout_period: form.payout_period as 'week' | 'month',
            min_nights: numberOrNull(form.min_nights),
            deposit_note: form.deposit_note || null,
            note: form.note || null,
            hotelier_visible: form.hotelier_visible,
        };
        const problem = validateTerms(next);
        if (problem) {
            showToast(problem, 'error');

            return;
        }
        try {
            await save.mutateAsync({
                terms: next,
                details: { bank: form.bank || null, holder: form.holder || null, requisites: form.requisites || null },
                actor,
            });
            showToast('Условия сохранены', 'success');
            onClose();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Не сохранилось', 'error');
        }
    };

    return (
        <TravelDialog
            isOpen
            onClose={onClose}
            title={`Условия: ${hotel.title}`}
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
                            <Label>Процент отелю от предоплаты (0–100)</Label>
                            <Input type="number" min={0} max={100} value={form.hotel_share_pct} onChange={(e) => set('hotel_share_pct')(e.target.value)} />
                        </div>
                    )}
                    {(form.model === 'fixed_per_booking' || form.model === 'fixed_per_night') && (
                        <div className="space-y-1">
                            <Label>{form.model === 'fixed_per_booking' ? 'Наш фикс за бронь, ₽' : 'Наш фикс за ночь, ₽'}</Label>
                            <Input type="number" min={0} value={form.fixed_amount} onChange={(e) => set('fixed_amount')(e.target.value)} />
                        </div>
                    )}
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={form.prepay_direct_to_hotel} onChange={(e) => set('prepay_direct_to_hotel')(e.target.checked)} />
                        Доверенный отель: клиент платит предоплату сразу отелю (тогда отель должен нам нашу долю)
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={form.hotelier_visible} onChange={(e) => set('hotelier_visible')(e.target.checked)} />
                        Показывать отелю его расчёты в кабинете «Мои расчёты» (нашу комиссию отель не видит)
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                            <Label>Период расчётов (справочно)</Label>
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
                            <Label>Бронь от N ночей (справочно)</Label>
                            <Input type="number" min={1} value={form.min_nights} onChange={(e) => set('min_nights')(e.target.value)} />
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
                    {terms?.updated_by && (
                        <p className="text-xs text-muted-foreground">
                            Последняя правка: {terms.updated_by}
                            {terms.updated_at ? `, ${new Date(terms.updated_at).toLocaleDateString('ru-RU')}` : ''}
                        </p>
                    )}
                </div>
            }
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Закрыть
                    </Button>
                    <Button type="button" disabled={save.isPending} onClick={onSave}>
                        {save.isPending ? 'Сохраняю…' : 'Сохранить'}
                    </Button>
                </>
            }
        />
    );
};

const TermsDialog: FC<{ hotel: HotelRef; terms: HotelTermsRow | null; actor: string; onClose: () => void }> = ({ hotel, terms, actor, onClose }) => {
    const { data: details, isSuccess } = usePaymentDetails(hotel.id);
    if (!isSuccess) return null;

    return <TermsForm hotel={hotel} terms={terms} details={details ?? null} actor={actor} onClose={onClose} />;
};

const MoneyDialog: FC<{
    kind: 'payout' | 'adjustment';
    hotel: HotelRef;
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
            showToast('Введите сумму больше нуля', 'error');

            return;
        }
        try {
            if (kind === 'payout') {
                await addPayout.mutateAsync({ hotel_id: hotel.id, paid_at: form.date, amount, method: form.method || null, comment: form.comment || null, created_by: actor });
            } else {
                await addAdjustment.mutateAsync({
                    hotel_id: hotel.id,
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
            title={kind === 'payout' ? `Выплата отелю: ${hotel.title}` : `Корректировка: ${hotel.title}`}
            description={
                <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                            <Label>Дата</Label>
                            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Сумма, ₽</Label>
                            <Input type="number" min={1} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
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

const balanceBadge = (balance: number) => (
    <Badge variant={balance > 0 ? 'destructive' : balance < 0 ? 'secondary' : 'outline'}>
        {balance > 0 ? `должны ${formatMoney(balance)}` : balance < 0 ? `нам должны ${formatMoney(-balance)}` : '0 ₽'}
    </Badge>
);

/**
 * Финансы с отелями: ведомость за неделю/месяц по выезду гостей, условия по
 * каждому отелю, выплаты и корректировки, накопленный остаток с начала учёта.
 * Доступ — только admin. Деньги переводит человек — программа фиксирует.
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

    const { data: startDay } = useAccountingStart();
    const saveStart = useSaveAccountingStart();
    const ready = period !== null && startDay !== undefined;
    const toDay = period?.toDay ?? 0;
    const { data: reserves = [], isPending, error } = useFinanceReserves(startDay ?? 0, toDay, ready);
    const { data: hotels = [] } = useFinanceHotels();
    const { data: terms = [] } = useHotelTerms();
    const { data: payouts = [] } = usePayouts(startDay ?? 0, toDay, ready);
    const { data: adjustments = [] } = useAdjustments(startDay ?? 0, toDay, ready);
    const remove = useSoftDeleteFinanceRow();

    const [expanded, setExpanded] = useState<string | null>(null);
    const [dialog, setDialog] = useState<{ kind: 'terms' | 'payout' | 'adjustment'; hotel: HotelRef } | null>(null);
    const [termsHotelId, setTermsHotelId] = useState('');

    const rows = useMemo(
        () =>
            ready && startDay !== undefined && period
                ? buildStatement({ reserves, hotels, terms, payouts, adjustments, startDay, fromDay: period.fromDay, toDay: period.toDay })
                : [],
        [ready, reserves, hotels, terms, payouts, adjustments, startDay, period],
    );
    const sum = useMemo(() => totals(rows), [rows]);
    const termsByHotel = useMemo(() => new Map(terms.map((t) => [t.hotel_id, t])), [terms]);

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

    const onSoftDelete = (table: 'hotel_payouts' | 'finance_adjustments', id: string, label: string) => {
        if (!window.confirm(`Пометить «${label}» как удалённую? Запись останется в журнале.`)) return;
        remove
            .mutateAsync({ table, id, actor })
            .then(() => showToast('Запись помечена удалённой', 'success'))
            .catch((e: unknown) => showToast(e instanceof Error ? e.message : 'Не удалось', 'error'));
    };

    const inPeriod = (iso: string) => !!period && iso >= isoDateFromDay(period.fromDay) && iso <= isoDateFromDay(period.toDay);

    return (
        <div className="mx-auto max-w-7xl space-y-4 px-2 pb-8 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/90 p-4 shadow-sm">
                <div>
                    <h1 className="text-2xl font-semibold">Финансы с отелями</h1>
                    <p className="text-sm text-muted-foreground">
                        Ведомость по выезду гостей. Остаток — накопленный с начала учёта
                        {startDay !== undefined ? ` (${formatDay(startDay)})` : ''}; всё раньше закрыто руками в OKO.
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

            <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white/90 p-3">
                <div className="space-y-1">
                    <Label>Условия отеля</Label>
                    <div className="flex gap-2">
                        <select
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                            value={termsHotelId}
                            onChange={(e) => setTermsHotelId(e.target.value)}
                        >
                            <option value="">выберите отель…</option>
                            {hotels.map((h) => (
                                <option key={h.id} value={h.id}>
                                    {h.title}
                                    {termsByHotel.has(h.id) ? '' : ' — условия не заданы'}
                                </option>
                            ))}
                        </select>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!termsHotelId}
                            onClick={() => {
                                const hotel = hotels.find((h) => h.id === termsHotelId);
                                if (hotel) setDialog({ kind: 'terms', hotel });
                            }}
                        >
                            Открыть
                        </Button>
                    </div>
                </div>
                <div className="space-y-1">
                    <Label>Начало учёта</Label>
                    <Input
                        type="date"
                        className="w-44"
                        value={startDay !== undefined ? isoDateFromDay(startDay) : ''}
                        onChange={(e) => {
                            if (!e.target.value) return;
                            if (!window.confirm('Сменить дату начала учёта? Остатки по всем отелям пересчитаются.')) return;
                            saveStart
                                .mutateAsync({ day: dayFromIsoDate(e.target.value), actor })
                                .catch((err: unknown) => showToast(err instanceof Error ? err.message : 'Не сохранилось', 'error'));
                        }}
                    />
                </div>
                <span className="text-xs text-muted-foreground">Условий задано: {terms.length} из {hotels.length} отелей</span>
            </div>

            {error && <p className="text-sm text-destructive">Не удалось загрузить: {error instanceof Error ? error.message : 'ошибка'}</p>}
            {(isPending || !ready) && <p className="text-sm text-muted-foreground">Загрузка…</p>}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                {[
                    ['Броней', String(sum.bookingsCount)],
                    ['Оборот', formatMoney(sum.gross)],
                    ['Предоплаты', formatMoney(sum.prepaid)],
                    ['Наше', formatMoney(sum.ourFee)],
                    ['Отелям за период', formatMoney(sum.weOweHotel)],
                    ['Выплачено за период', formatMoney(sum.paid)],
                    ['Итого должны отелям', formatMoney(sum.balanceWeOwe)],
                    ['Итого нам должны', formatMoney(sum.balanceOwedToUs)],
                ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border bg-white/90 p-3">
                        <div className="text-lg font-semibold">{value}</div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                    </div>
                ))}
            </div>
            {sum.hotelsWithoutTerms > 0 && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                    У {sum.hotelsWithoutTerms} отелей с выездами в периоде условия не заданы — их доля в долг не попадает. Откройте
                    «Условия» в строке отеля.
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
                                    <th className="p-3 text-right">Сальдо за период</th>
                                    <th className="p-3 text-right">Выплачено</th>
                                    <th className="p-3 text-right">Остаток накопл.</th>
                                    <th className="p-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 && ready && !isPending && (
                                    <tr>
                                        <td className="p-3 text-muted-foreground" colSpan={9}>
                                            В этом периоде выездов, выплат и остатков нет.
                                        </td>
                                    </tr>
                                )}
                                {rows.map((row) => {
                                    const hotelRef: HotelRef = { id: row.hotelId, title: row.hotelTitle };
                                    const noTerms = !row.terms && row.bookingsCount > 0;

                                    return (
                                        <Fragment key={row.hotelId}>
                                            <tr className={`border-b ${noTerms ? 'bg-amber-50/60' : ''}`}>
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
                                                <td className="p-3 text-right">{row.terms ? formatMoney(row.ourFee) : '—'}</td>
                                                <td className="p-3 text-right">{row.terms || row.bookingsCount === 0 ? formatMoney(row.periodDue) : '—'}</td>
                                                <td className="p-3 text-right">{formatMoney(row.paid)}</td>
                                                <td className="p-3 text-right font-semibold">{balanceBadge(row.balance)}</td>
                                                <td className="p-3">
                                                    <div className="flex flex-wrap justify-end gap-1">
                                                        <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: 'terms', hotel: hotelRef })}>
                                                            Условия
                                                        </Button>
                                                        <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: 'payout', hotel: hotelRef })}>
                                                            Выплата
                                                        </Button>
                                                        <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ kind: 'adjustment', hotel: hotelRef })}>
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
                                                                    <span>
                                                                        предоплата {b.prepaidUnknown ? `не прочитана («${String(b.reserve.prepayment)}»)` : formatMoney(b.prepaid)}
                                                                    </span>
                                                                    {b.ourFee != null && <span>наше {formatMoney(b.ourFee)}</span>}
                                                                    {b.weOweHotel > 0 && <span>отелю {formatMoney(b.weOweHotel)}</span>}
                                                                    {b.hotelOwesUs > 0 && <span>отель должен нам {formatMoney(b.hotelOwesUs)}</span>}
                                                                    {b.statusUnknown && <span className="text-amber-800">статус не проверен (нет карточки и сделки)</span>}
                                                                </div>
                                                            ))}
                                                            {payouts
                                                                .filter((p) => p.hotel_id === row.hotelId && inPeriod(p.paid_at))
                                                                .map((p) => (
                                                                    <div key={p.id} className="flex flex-wrap gap-3 text-green-800">
                                                                        <span className="w-56">Выплата {p.paid_at}</span>
                                                                        <span>{formatMoney(Number(p.amount))}</span>
                                                                        <span>{p.method ?? ''}</span>
                                                                        <span>{p.comment ?? ''}</span>
                                                                        <span>{p.created_by ?? ''}</span>
                                                                        <button type="button" className="underline" onClick={() => onSoftDelete('hotel_payouts', p.id, `выплата ${formatMoney(Number(p.amount))}`)}>
                                                                            удалить
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            {adjustments
                                                                .filter((a) => a.hotel_id === row.hotelId && inPeriod(a.date))
                                                                .map((a) => (
                                                                    <div key={a.id} className="flex flex-wrap gap-3 text-amber-800">
                                                                        <span className="w-56">Корректировка {a.date}</span>
                                                                        <span>{a.direction === 'we_owe_hotel' ? 'мы должны отелю' : 'отель должен нам'}</span>
                                                                        <span>{formatMoney(Number(a.amount))}</span>
                                                                        <span>{a.comment ?? ''}</span>
                                                                        <button type="button" className="underline" onClick={() => onSoftDelete('finance_adjustments', a.id, `корректировка ${formatMoney(Number(a.amount))}`)}>
                                                                            удалить
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            {row.bookingsCount === 0 && (
                                                                <div className="text-muted-foreground">В этом периоде выездов нет — показан накопленный остаток.</div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {dialog?.kind === 'terms' && (
                <TermsDialog hotel={dialog.hotel} terms={termsByHotel.get(dialog.hotel.id) ?? null} actor={actor} onClose={() => setDialog(null)} />
            )}
            {dialog && dialog.kind !== 'terms' && today !== null && (
                <MoneyDialog kind={dialog.kind} hotel={dialog.hotel} actor={actor} todayIso={isoDateFromDay(today)} onClose={() => setDialog(null)} />
            )}
        </div>
    );
};
