'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useClients } from '@/features/Crm/api/crm';
import { STAGE_LABELS, type Stage } from '@/features/Crm/lib/crm';
import { isCrmEnabled } from '@/shared/config/featureFlags';
import { PagesEnum, routes } from '@/shared/config/routes';
import { $user } from '@/shared/models/auth';
import { showToast } from '@/shared/ui/Toast/Toast';
import { TravelDialog } from '@/shared/ui/TravelDialog/TravelDialog';
import { useUnit } from 'effector-react/compat';
import { RefreshCw, Search, Send } from 'lucide-react';
import Link from 'next/link';
import { FC, useEffect, useMemo, useState } from 'react';

import { useAttachChat, useChat, useChatOutbox, useInbox, useReply } from '../api/inbox';
import {
    channelName,
    counts,
    FILTER_LABELS,
    filterRows,
    formatMoment,
    humanWait,
    isOverdue,
    lastSpeaker,
    waitingHours,
    type InboxFilter,
    type InboxRow,
} from '../lib/inbox';

const FILTERS: InboxFilter[] = ['waiting', 'overdue', 'unknown', 'all'];

/** Привязать чат к существующему клиенту: поиск по имени или телефону. */
const MergeDialog: FC<{ row: InboxRow; onClose: () => void }> = ({ row, onClose }) => {
    const [input, setInput] = useState('');
    const [term, setTerm] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => setTerm(input), 400);

        return () => clearTimeout(timer);
    }, [input]);
    const { data: clients = [], isPending } = useClients(term);
    const attach = useAttachChat();

    return (
        <TravelDialog
            isOpen
            onClose={onClose}
            title="Чей это чат?"
            description={
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Переписка и сделки переедут к выбранному клиенту
                        {row.client_id ? ', временная карточка исчезнет' : ''}.
                    </p>
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            className="pl-8"
                            placeholder="Иванова или 8 900 …"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                        />
                    </div>
                    {isPending && <p className="text-sm text-muted-foreground">Ищу…</p>}
                    <div className="max-h-72 space-y-1 overflow-y-auto">
                        {clients
                            .filter((c) => c.id !== row.client_id)
                            .map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    disabled={attach.isPending}
                                    className="block w-full rounded-lg border bg-white p-2 text-left text-sm hover:bg-muted/40"
                                    onClick={() =>
                                        attach
                                            .mutateAsync({
                                                messengerId: row.messenger_id,
                                                temporaryClientId: row.is_temporary ? row.client_id : null,
                                                into: c.id,
                                            })
                                            .then(() => {
                                                showToast('Чат привязан к клиенту', 'success');
                                                onClose();
                                            })
                                            .catch((e: unknown) =>
                                                showToast(e instanceof Error ? e.message : 'Не получилось', 'error'),
                                            )
                                    }
                                >
                                    <span className="font-medium">{c.name ?? '—'}</span>
                                    <span className="ml-2 text-muted-foreground">{c.phones.join(', ')}</span>
                                </button>
                            ))}
                        {!isPending && clients.length === 0 && (
                            <p className="text-sm text-muted-foreground">Никого не нашлось.</p>
                        )}
                    </div>
                </div>
            }
            footer={
                <Button type="button" variant="outline" onClick={onClose}>
                    Закрыть
                </Button>
            }
        />
    );
};

/** Переписка одного чата с полем ответа. */
const ChatPanel: FC<{ row: InboxRow; actor: string; onMerge: () => void }> = ({ row, actor, onMerge }) => {
    const { data: messages = [], isPending } = useChat(row.messenger_id);
    const { data: outbox = [] } = useChatOutbox(row.messenger_id);
    const reply = useReply();
    const [text, setText] = useState('');

    // Номер клиента в ОКО: сначала из карточки клиента, иначе из переписки.
    // У чатов из мессенджеров его чаще всего нет вовсе — ОКО принимает
    // отправку и без него, по идентификатору переписки (проверено вживую).
    const okoClientId = useMemo(() => {
        if (row.oko_client_id) return row.oko_client_id;
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            if (messages[i].oko_client_id) return messages[i].oko_client_id;
        }

        return null;
    }, [row.oko_client_id, messages]);

    return (
        <Card className="flex h-full flex-col bg-white/90">
            <CardHeader className="p-4">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>{row.client_name ?? 'Клиент без имени'}</span>
                    <span className="flex items-center gap-2">
                        <Badge variant="outline">{channelName(row.integration_id)}</Badge>
                        {row.is_temporary && (
                            <Button type="button" size="sm" variant="secondary" onClick={onMerge}>
                                Чей это чат?
                            </Button>
                        )}
                    </span>
                </CardTitle>
                <CardDescription>
                    {row.client_phones?.length ? row.client_phones.join(', ') : 'телефон неизвестен'}
                    {row.deal_id && row.deal_stage ? ` · сделка: ${STAGE_LABELS[row.deal_stage as Stage] ?? row.deal_stage}` : ''}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-4 pt-0">
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-2 text-sm">
                    {isPending && <p className="text-muted-foreground">Загрузка…</p>}
                    {messages.map((m) => (
                        <div
                            key={m.id}
                            className={`max-w-[85%] rounded-lg px-3 py-2 ${m.direction === 'in' ? 'bg-white' : 'ml-auto bg-green-50'}`}
                        >
                            <div className="text-[11px] text-muted-foreground">
                                {m.author_name ?? (m.direction === 'in' ? 'Клиент' : 'Менеджер')} ·{' '}
                                {m.sent_at ? formatMoment(m.sent_at) : ''}
                            </div>
                            {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
                            {m.files.length > 0 && <div className="text-xs">📎 {m.files.join(', ')}</div>}
                        </div>
                    ))}
                    {outbox.map((o) => (
                        <div key={o.id} className="ml-auto max-w-[85%] rounded-lg border border-dashed px-3 py-2">
                            <div className="text-[11px] text-muted-foreground">
                                {o.status === 'failed'
                                    ? 'не ушло'
                                    : o.status === 'stuck'
                                      ? 'проверьте в ОКО: могло уйти'
                                      : 'отправляется через ОКО…'}
                            </div>
                            <div className="whitespace-pre-wrap">{String(o.payload?.text ?? '')}</div>
                            {o.last_error && <div className="text-xs text-destructive">{o.last_error}</div>}
                        </div>
                    ))}
                </div>
                <Textarea
                    rows={3}
                    placeholder="Ответ клиенту — уйдёт в его мессенджер через ОКО"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Отправляет человек, сообщение уйдёт в течение минуты.</span>
                    <Button
                        type="button"
                        size="sm"
                        disabled={!text.trim() || reply.isPending}
                        onClick={() =>
                            reply
                                .mutateAsync({
                                    messengerId: row.messenger_id,
                                    okoClientId,
                                    clientId: row.client_id,
                                    dealId: row.deal_id,
                                    text: text.trim(),
                                    actor,
                                })
                                .then(() => {
                                    setText('');
                                    showToast('Поставлено в очередь на отправку', 'success');
                                })
                                .catch((e: unknown) => showToast(e instanceof Error ? e.message : 'Не получилось', 'error'))
                        }
                    >
                        <Send className="size-4" />
                        {reply.isPending ? 'Ставлю…' : 'Ответить'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

/**
 * «Входящие» — живая переписка из ОКО. Заменяет ежедневный обход мессенджеров:
 * видно, кто ждёт ответа и сколько, кто завис дольше часа, чей чат ещё не
 * привязан к клиенту.
 */
export const InboxPage = () => {
    const user = useUnit($user);
    const actor = [user?.name, user?.surname].filter(Boolean).join(' ') || 'менеджер';
    const [days, setDays] = useState(14);
    const [filter, setFilter] = useState<InboxFilter>('waiting');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [mergeRow, setMergeRow] = useState<InboxRow | null>(null);
    const [nowMs, setNowMs] = useState(0);
    useEffect(() => {
        setNowMs(Date.now());
        const timer = setInterval(() => setNowMs(Date.now()), 60_000);

        return () => clearInterval(timer);
    }, []);

    const { data: rows = [], isPending, error, refetch, isFetching } = useInbox(days);
    const visible = useMemo(() => filterRows(rows, filter, nowMs), [rows, filter, nowMs]);
    const stats = useMemo(() => counts(rows, nowMs), [rows, nowMs]);
    // Выбранный чат ищем во ВСЁМ списке, а не в отборе: список обновляется сам
    // раз в минуту, и чат, которому только что ответили, выпадает из «Ждут
    // ответа». Если бы панель в этот момент переключилась на соседний чат,
    // набранный ответ ушёл бы чужому человеку.
    const selected = useMemo(
        () => (selectedId === null ? (visible[0] ?? null) : (rows.find((r) => r.messenger_id === selectedId) ?? null)),
        [rows, visible, selectedId],
    );

    if (!isCrmEnabled(user?.role)) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Входящие</CardTitle>
                    <CardDescription>Раздел пока открыт только администратору.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-4 px-2 pb-8 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/90 p-4 shadow-sm">
                <div>
                    <h1 className="text-2xl font-semibold">Входящие</h1>
                    <p className="text-sm text-muted-foreground">
                        Живая переписка из ОКО по всем каналам. Видно, кто ждёт ответа и сколько.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link href={routes[PagesEnum.DEALS]} className="text-sm underline">
                        Сделки
                    </Link>
                    <select
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                    >
                        <option value={3}>3 дня</option>
                        <option value={14}>2 недели</option>
                        <option value={60}>2 месяца</option>
                    </select>
                    <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                        <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {FILTERS.map((key) => (
                    <Button
                        key={key}
                        type="button"
                        size="sm"
                        variant={filter === key ? 'default' : 'outline'}
                        onClick={() => setFilter(key)}
                    >
                        {FILTER_LABELS[key]}
                        <Badge variant="secondary" className="ml-1">
                            {stats[key]}
                        </Badge>
                    </Button>
                ))}
            </div>

            {error && (
                <p className="text-sm text-destructive">
                    Не удалось загрузить: {error instanceof Error ? error.message : 'ошибка'}
                </p>
            )}
            {isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}
            {!isPending && rows.length === 0 && (
                <Card>
                    <CardContent className="p-4 text-sm text-muted-foreground">
                        Переписки пока нет. Она появляется сама, как только клиент пишет в любой из каналов ОКО.
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
                <div className="max-h-[70vh] space-y-2 overflow-y-auto">
                    {visible.map((row) => {
                        const hours = waitingHours(row, nowMs);
                        const overdue = isOverdue(row, nowMs);
                        const active = selected?.messenger_id === row.messenger_id;

                        return (
                            <button
                                key={row.messenger_id}
                                type="button"
                                onClick={() => setSelectedId(row.messenger_id)}
                                className={`w-full rounded-lg border p-3 text-left text-sm ${active ? 'border-primary bg-muted/50' : 'bg-white hover:bg-muted/30'} ${overdue ? 'border-red-200' : ''}`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate font-medium">
                                        {row.client_name ?? 'Клиент без имени'}
                                        {row.is_temporary && <span className="ml-1 text-xs text-amber-700">новый</span>}
                                    </span>
                                    {hours !== null && nowMs > 0 && (
                                        <Badge variant={overdue ? 'destructive' : 'secondary'}>ждёт {humanWait(hours)}</Badge>
                                    )}
                                </div>
                                <div className="truncate text-muted-foreground">{row.last_text || '—'}</div>
                                <div className="text-xs text-muted-foreground">
                                    {channelName(row.integration_id)} · {formatMoment(row.last_at)} ·{' '}
                                    {lastSpeaker(row)}
                                </div>
                            </button>
                        );
                    })}
                    {!isPending && visible.length === 0 && rows.length > 0 && (
                        <p className="text-sm text-muted-foreground">В этом отборе пусто.</p>
                    )}
                </div>

                <div className="min-h-[50vh]">
                    {selected ? (
                        // key обязателен: без него React оставит набранный текст
                        // при переключении на другой чат.
                        <ChatPanel
                            key={selected.messenger_id}
                            row={selected}
                            actor={actor}
                            onMerge={() => setMergeRow(selected)}
                        />
                    ) : (
                        <Card className="bg-white/90">
                            <CardContent className="p-4 text-sm text-muted-foreground">Выберите чат слева.</CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {mergeRow && <MergeDialog row={mergeRow} onClose={() => setMergeRow(null)} />}
        </div>
    );
};
