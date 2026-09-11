'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isCrmEnabled } from '@/shared/config/featureFlags';
import { PagesEnum, routes } from '@/shared/config/routes';
import { $user } from '@/shared/models/auth';
import { TravelDialog } from '@/shared/ui/TravelDialog/TravelDialog';
import { showToast } from '@/shared/ui/Toast/Toast';
import dayjs from 'dayjs';
import { useUnit } from 'effector-react/compat';
import { Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { FC, useEffect, useMemo, useState } from 'react';

import { DEALS_PER_STAGE, useCreateDeal, useDealsBoard, type StageStats } from '../api/crm';
import {
    clientOf,
    DEAL_SOURCES,
    dealAgeDays,
    dealTitle,
    formatMoney,
    groupByStage,
    PIPELINES,
    RESPONSIBLES,
    type DealRow,
    type Pipeline,
    type StageColumn,
} from '../lib/crm';
import { DealModal } from './DealModal';

const DealCard: FC<{ deal: DealRow; nowMs: number; onOpen: (deal: DealRow) => void }> = ({ deal, nowMs, onOpen }) => {
    const client = clientOf(deal);
    const age = dealAgeDays(deal, nowMs);
    const created = deal.oko_created_at ?? deal.created_at;

    return (
        <button
            type="button"
            onClick={() => onOpen(deal)}
            className="w-full rounded-lg border bg-white p-3 text-left text-sm shadow-sm transition-colors hover:bg-muted/40"
        >
            <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{dealTitle(deal)}</span>
                {deal.source && <span className="text-[10px] text-muted-foreground">{deal.source}</span>}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">ФИО</div>
            <div>{client?.name ?? '—'}</div>
            <div className="mt-1 text-xs text-muted-foreground">Дата создания</div>
            <div className="flex items-center gap-2">
                {age >= 1 && (
                    <Badge variant="destructive" className="px-1 py-0 text-[10px]">
                        {age} дн.
                    </Badge>
                )}
                <span>{created ? dayjs(created).format('DD.MM.YYYY HH:mm') : '—'}</span>
            </div>
            {deal.total != null && (
                <>
                    <div className="mt-1 text-xs text-muted-foreground">Сумма сделки</div>
                    <div>{formatMoney(deal.total)}</div>
                </>
            )}
            <div className="mt-1 text-xs text-muted-foreground">Ответственный</div>
            <div>{deal.responsible ?? '—'}</div>
        </button>
    );
};

const Column: FC<{ column: StageColumn; stats?: StageStats[string]; nowMs: number; onOpen: (deal: DealRow) => void }> = ({
    column,
    stats,
    nowMs,
    onOpen,
}) => (
    <div className="flex w-64 shrink-0 flex-col gap-2">
        <div className="rounded-lg border bg-white p-2 shadow-sm" style={{ borderTop: `4px solid ${column.stage.color}` }}>
            <div className="font-medium">{column.stage.label}</div>
            <div className="flex justify-between text-xs text-muted-foreground">
                <span>{stats?.count ?? column.deals.length} сделок</span>
                <span>{formatMoney(stats?.sum ?? column.sum)}</span>
            </div>
        </div>
        {column.deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} nowMs={nowMs} onOpen={onOpen} />
        ))}
        {stats && stats.count > column.deals.length && (
            <div className="text-center text-xs text-muted-foreground">
                показаны последние {column.deals.length} из {stats.count}
            </div>
        )}
    </div>
);

const NewDealDialog: FC<{ isOpen: boolean; onClose: () => void; actor: string }> = ({ isOpen, onClose, actor }) => {
    const create = useCreateDeal();
    const [form, setForm] = useState({ title: '', clientName: '', clientPhone: '', source: '', responsible: actor });

    return (
        <TravelDialog
            isOpen={isOpen}
            onClose={onClose}
            title="Новая сделка"
            description={
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label>ФИО клиента</Label>
                        <Input value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                        <Label>Мобильный телефон</Label>
                        <Input value={form.clientPhone} onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                        <Label>Название сделки (необязательно)</Label>
                        <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                            <Label>Источник</Label>
                            <Select value={form.source || undefined} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Выберите" />
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
                        <div className="space-y-1">
                            <Label>Ответственный</Label>
                            <Select value={form.responsible || undefined} onValueChange={(v) => setForm((f) => ({ ...f, responsible: v }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Выберите" />
                                </SelectTrigger>
                                <SelectContent>
                                    {[...new Set([...RESPONSIBLES, actor])].map((name) => (
                                        <SelectItem key={name} value={name}>
                                            {name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            }
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Отмена
                    </Button>
                    <Button
                        type="button"
                        disabled={create.isPending || (!form.clientName && !form.clientPhone && !form.title)}
                        onClick={() =>
                            create
                                .mutateAsync({
                                    title: form.title.trim(),
                                    source: form.source || null,
                                    responsible: form.responsible,
                                    clientName: form.clientName.trim(),
                                    clientPhone: form.clientPhone.trim(),
                                })
                                .then(() => {
                                    showToast('Сделка создана на этапе «Заявка»', 'success');
                                    onClose();
                                })
                                .catch((error: unknown) => showToast(error instanceof Error ? error.message : 'Не получилось', 'error'))
                        }
                    >
                        Создать
                    </Button>
                </>
            }
        />
    );
};

/** Канбан сделок — воронка OKO один в один: те же этапы, цвета, карточки, шапка с суммой. */
export const DealsBoardPage = () => {
    const user = useUnit($user);
    const actor = [user?.name, user?.surname].filter(Boolean).join(' ') || 'менеджер';
    const [pipeline, setPipeline] = useState<Pipeline>('sales');
    const [selected, setSelected] = useState<DealRow | null>(null);
    const [isNewOpen, setIsNewOpen] = useState(false);
    const [nowMs, setNowMs] = useState(0);
    useEffect(() => {
        setNowMs(Date.now());
    }, []);

    const stages = useMemo(() => PIPELINES.find((p) => p.key === pipeline)?.stages ?? [], [pipeline]);
    const { data, isPending, error, refetch, isFetching } = useDealsBoard(
        pipeline,
        stages.map((s) => s.key),
    );
    const columns = useMemo(() => groupByStage(data?.deals ?? [], pipeline), [data, pipeline]);
    const totalCount = Object.values(data?.stats ?? {}).reduce((n, s) => n + s.count, 0);
    const totalSum = Object.values(data?.stats ?? {}).reduce((n, s) => n + s.sum, 0);

    // Открытая карточка обновляется вместе со списком (после «Сохранить»).
    const selectedFresh = useMemo(
        () => (selected ? (data?.deals.find((d) => d.id === selected.id) ?? selected) : null),
        [selected, data],
    );

    if (!isCrmEnabled(user?.role)) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Сделки</CardTitle>
                    <CardDescription>Раздел пока открыт только администратору.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="space-y-4 px-2 pb-8 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/90 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                    <Select value={pipeline} onValueChange={(v) => setPipeline(v as Pipeline)}>
                        <SelectTrigger className="w-56 text-lg font-semibold">
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
                    <span className="text-sm text-muted-foreground">
                        Сделок: <b>{totalCount}</b> · Сумма: <b>{formatMoney(totalSum)}</b>
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={routes[PagesEnum.CLIENTS]} className="text-sm underline">
                        Контакты
                    </Link>
                    <Link href={routes[PagesEnum.IMPORT]} className="text-sm underline">
                        Импорт из OKO
                    </Link>
                    <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                        <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button type="button" onClick={() => setIsNewOpen(true)}>
                        <Plus className="size-4" />
                        Сделка
                    </Button>
                </div>
            </div>

            {error && (
                <p className="text-sm text-destructive">Не удалось загрузить: {error instanceof Error ? error.message : 'ошибка'}</p>
            )}
            {isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}
            {!isPending && totalCount === 0 && (
                <Card>
                    <CardContent className="p-4 text-sm text-muted-foreground">
                        Сделок пока нет. Загрузите выгрузку из OKO на странице «Импорт из OKO» или создайте сделку.
                    </CardContent>
                </Card>
            )}

            <div className="overflow-x-auto">
                <div className="flex min-w-max gap-3 pb-2">
                    {columns.map((column) => (
                        <Column
                            key={column.stage.key}
                            column={column}
                            stats={data?.stats[column.stage.key]}
                            nowMs={nowMs}
                            onOpen={setSelected}
                        />
                    ))}
                </div>
            </div>
            {totalCount > columns.length * DEALS_PER_STAGE && (
                <p className="text-xs text-muted-foreground">В колонках показаны последние {DEALS_PER_STAGE} сделок каждого этапа; остальные — через поиск по клиентам.</p>
            )}

            {selectedFresh && (
                <DealModal
                    isOpen={!!selectedFresh}
                    onClose={() => setSelected(null)}
                    deal={selectedFresh}
                    actor={actor}
                    responsibles={RESPONSIBLES}
                />
            )}
            {isNewOpen && <NewDealDialog isOpen={isNewOpen} onClose={() => setIsNewOpen(false)} actor={actor} />}
        </div>
    );
};
