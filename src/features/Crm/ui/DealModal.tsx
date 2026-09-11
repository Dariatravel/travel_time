'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TravelDialog } from '@/shared/ui/TravelDialog/TravelDialog';
import { showToast } from '@/shared/ui/Toast/Toast';
import dayjs from 'dayjs';
import { FC, useEffect, useMemo, useRef, useState } from 'react';

import { useClientMessages, useSaveDeal, type DealPatch } from '../api/crm';
import {
    clientOf,
    DEAL_SOURCES,
    dealTitle,
    formatMoney,
    PIPELINES,
    STAGE_LABELS,
    type DealRow,
    type Pipeline,
    type Stage,
} from '../lib/crm';

export interface DealModalProps {
    isOpen: boolean;
    onClose: () => void;
    deal: DealRow;
    actor: string;
    responsibles: readonly string[];
}

type Tab = 'main' | 'chat';

const PAYMENT_BANKS = [
    'Райффайзенбанка', 'Альфа-банка', 'Сбербанка', 'ВТБ', 'Т-банка', 'Озон-банка',
    'Совкомбанка', 'Челябинвестбанка', 'Рокетбанка', 'ПСБ', 'ОТП', 'Газпромбанка',
];

const numberOrNull = (value: string): number | null => {
    if (value.trim() === '') return null;
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));

    return Number.isFinite(parsed) ? parsed : null;
};

const asInput = (value: number | string | null | undefined) => (value == null ? '' : String(value));

const formFromDeal = (deal: DealRow) => ({
    title: deal.title ?? '',
    pipeline: deal.pipeline,
    stage: deal.stage,
    source: deal.source ?? '',
    responsible: deal.responsible ?? '',
    hotel_title: deal.hotel_title ?? '',
    check_in: deal.check_in ?? '',
    check_out: deal.check_out ?? '',
    people: asInput(deal.people),
    price_per_night: asInput(deal.price_per_night),
    nights: asInput(deal.nights),
    service_note: deal.service_note ?? '',
    total: asInput(deal.total),
    prepaid: asInput(deal.prepaid),
    to_pay: asInput(deal.to_pay),
    payment_bank: deal.payment_bank ?? '',
    payment_date: deal.payment_date ?? '',
    comment: deal.comment ?? '',
    refund_amount: asInput(deal.refund_amount),
    penalty: asInput(deal.penalty),
});

/**
 * Карточка сделки — по образцу OKO: слева «Основное» с теми же полями,
 * справа «Лента» и «Чат» (переписка клиента — в OKO чат на контакт).
 * Этап меняется выпадающим списком; воронку можно сменить (продажи → возврат).
 */
export const DealModal: FC<DealModalProps> = ({ isOpen, onClose, deal, actor, responsibles }) => {
    const save = useSaveDeal();
    const [tab, setTab] = useState<Tab>('main');
    const client = clientOf(deal);
    const { data: messages = [], isPending: isChatPending } = useClientMessages(
        deal.client_id ?? client?.id ?? null,
        isOpen && tab === 'chat',
    );

    const [form, setForm] = useState(() => formFromDeal(deal));
    // Форма заполняется из сделки только когда сделка реально изменилась (updated_at),
    // а не при каждом перечитывании списка — несохранённые правки не пропадают.
    const loadedVersion = useRef<string>(deal.updated_at);
    useEffect(() => {
        if (loadedVersion.current === deal.updated_at) return;
        loadedVersion.current = deal.updated_at;
        setForm(formFromDeal(deal));
    }, [deal]);

    const stages = useMemo(() => PIPELINES.find((p) => p.key === form.pipeline)?.stages ?? [], [form.pipeline]);
    const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
    const setPipeline = (value: string) => {
        const pipeline = value as Pipeline;
        const first = PIPELINES.find((p) => p.key === pipeline)?.stages[0]?.key ?? form.stage;
        setForm((f) => ({ ...f, pipeline, stage: first }));
    };

    const onSave = async () => {
        const patch: DealPatch = {
            title: form.title || null,
            pipeline: form.pipeline,
            stage: form.stage as Stage,
            source: form.source || null,
            responsible: form.responsible || null,
            hotel_title: form.hotel_title || null,
            check_in: form.check_in || null,
            check_out: form.check_out || null,
            people: numberOrNull(form.people),
            price_per_night: numberOrNull(form.price_per_night),
            nights: numberOrNull(form.nights),
            service_note: form.service_note || null,
            total: numberOrNull(form.total),
            prepaid: numberOrNull(form.prepaid),
            to_pay: numberOrNull(form.to_pay),
            payment_bank: form.payment_bank || null,
            payment_date: form.payment_date || null,
            comment: form.comment || null,
            refund_amount: numberOrNull(form.refund_amount),
            penalty: numberOrNull(form.penalty),
        };
        try {
            await save.mutateAsync({
                id: deal.id,
                patch,
                actor,
                stageChanged: form.stage !== deal.stage || form.pipeline !== deal.pipeline,
            });
            showToast('Сделка сохранена', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Не сохранилось', 'error');
        }
    };

    const text = (label: string, key: keyof typeof form, type: 'text' | 'number' | 'date' = 'text') => (
        <div className="space-y-1">
            <Label>{label}</Label>
            <Input type={type} value={form[key]} placeholder="Введите значение" onChange={(e) => set(key)(e.target.value)} />
        </div>
    );

    const stageIndex = stages.findIndex((x) => x.key === form.stage);

    return (
        <TravelDialog
            isOpen={isOpen}
            onClose={onClose}
            className="sm:max-w-5xl"
            title={
                <span className="flex flex-wrap items-center gap-2">
                    {deal.oko_lead_id && <span className="text-xs text-muted-foreground">id {deal.oko_lead_id}</span>}
                    {dealTitle(deal)}
                    <Badge variant="secondary">{STAGE_LABELS[deal.stage]}</Badge>
                </span>
            }
            description={
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label>Название сделки</Label>
                            <Input value={form.title} placeholder="Название сделки" onChange={(e) => set('title')(e.target.value)} />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label>Воронка</Label>
                                <Select value={form.pipeline} onValueChange={setPipeline}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PIPELINES.map((p) => (
                                            <SelectItem key={p.key} value={p.key}>
                                                {p.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label>Этап</Label>
                                <Select value={form.stage} onValueChange={set('stage')}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {stages.map((s) => (
                                            <SelectItem key={s.key} value={s.key}>
                                                {s.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex gap-1">
                            {stages.map((s, i) => (
                                <span key={s.key} className="h-1 flex-1 rounded" style={{ background: i <= stageIndex ? s.color : '#e5e7eb' }} />
                            ))}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label>Ответственный</Label>
                                <Select value={form.responsible || undefined} onValueChange={set('responsible')}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Выберите" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[...new Set([...responsibles, form.responsible].filter(Boolean))].map((name) => (
                                            <SelectItem key={name} value={name}>
                                                {name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label>Источник</Label>
                                <Select value={form.source || undefined} onValueChange={set('source')}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Выберите значение" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DEAL_SOURCES.map((s) => (
                                            <SelectItem key={s} value={s}>
                                                {s}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="text-xs font-semibold uppercase text-muted-foreground">Заказчик</div>
                        {text('Отель', 'hotel_title')}
                        {deal.hotel_full && <div className="text-xs text-muted-foreground">{deal.hotel_full}</div>}
                        <div className="grid gap-2 sm:grid-cols-2">
                            {text('Дата заезда', 'check_in', 'date')}
                            {text('Дата выезда', 'check_out', 'date')}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {text('Количество человек в номере', 'people', 'number')}
                            {text('Стоимость номера за сутки', 'price_per_night', 'number')}
                            {text('Количество ночей', 'nights', 'number')}
                        </div>
                        {text('Услуга закрепления выбранного номера', 'service_note')}
                        <div className="grid gap-2 sm:grid-cols-3">
                            {text('Сумма сделки', 'total', 'number')}
                            {text('Оплачено гостем (услуга бронирования)', 'prepaid', 'number')}
                            {text('К оплате при заселении', 'to_pay', 'number')}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label>Перевод на карту</Label>
                                <Select value={form.payment_bank || undefined} onValueChange={set('payment_bank')}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Банк" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PAYMENT_BANKS.map((b) => (
                                            <SelectItem key={b} value={b}>
                                                {b}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {text('Дата брони', 'payment_date', 'date')}
                        </div>
                        {form.pipeline === 'refund' && (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {text('Сумма возврата', 'refund_amount', 'number')}
                                {text('Сумма штрафа', 'penalty', 'number')}
                            </div>
                        )}
                        <div className="space-y-1">
                            <Label>Комментарий</Label>
                            <Textarea rows={3} value={form.comment} onChange={(e) => set('comment')(e.target.value)} />
                        </div>

                        <div className="rounded-lg border p-3 text-sm">
                            <div className="text-xs font-semibold uppercase text-muted-foreground">Контакт</div>
                            {client ? (
                                <>
                                    <div className="font-medium">{client.name ?? '—'}</div>
                                    <div>{client.phones.join(', ') || 'Телефон не указан'}</div>
                                    {client.emails.length > 0 && <div>{client.emails.join(', ')}</div>}
                                </>
                            ) : (
                                <div className="text-muted-foreground">Контакт не привязан</div>
                            )}
                        </div>
                        {deal.oko_url && (
                            <a className="text-xs underline" href={deal.oko_url} target="_blank" rel="noreferrer">
                                Открыть в OKO
                            </a>
                        )}
                    </div>

                    <div className="space-y-3">
                        <div className="flex gap-2">
                            {(['main', 'chat'] as Tab[]).map((key) => (
                                <Button key={key} type="button" size="sm" variant={tab === key ? 'default' : 'outline'} onClick={() => setTab(key)}>
                                    {key === 'main' ? 'Лента' : 'Чат'}
                                </Button>
                            ))}
                        </div>
                        {tab === 'main' && (
                            <div className="space-y-1 text-sm text-muted-foreground">
                                <div>Создана: {dayjs(deal.oko_created_at ?? deal.created_at).format('DD.MM.YYYY HH:mm')}</div>
                                {deal.arrived_stage_at && <div>На этапе с: {dayjs(deal.arrived_stage_at).format('DD.MM.YYYY HH:mm')}</div>}
                                {deal.updated_by && <div>Последняя правка: {deal.updated_by}</div>}
                                <div>Сумма: {formatMoney(deal.total)} · предоплата {formatMoney(deal.prepaid)}</div>
                            </div>
                        )}
                        {tab === 'chat' && (
                            <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-2 text-sm">
                                {isChatPending && <div className="text-muted-foreground">Загрузка…</div>}
                                {!isChatPending && messages.length === 0 && (
                                    <div className="text-muted-foreground">Переписки нет (или ещё не импортирована).</div>
                                )}
                                {messages.map((m) => (
                                    <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 ${m.direction === 'in' ? 'bg-white' : 'ml-auto bg-green-50'}`}>
                                        <div className="text-[11px] text-muted-foreground">
                                            {m.author_name ?? (m.direction === 'in' ? 'Клиент' : 'Менеджер')} ·{' '}
                                            {m.sent_at ? dayjs(m.sent_at).format('DD.MM.YY HH:mm') : ''}
                                        </div>
                                        {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
                                        {m.files.length > 0 && <div className="text-xs">📎 {m.files.join(', ')}</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
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
