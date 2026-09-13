'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { isInstagramEnabled } from '@/shared/config/featureFlags';
import { $user } from '@/shared/models/auth';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useUnit } from 'effector-react/compat';
import { ExternalLink, PlugZap, RefreshCw, Send } from 'lucide-react';
import { FC, useEffect, useMemo, useState } from 'react';

import {
    ApiError,
    useChannels,
    useChatMessages,
    useChatOutbox,
    useInstagramChats,
    useSendReply,
    useWazzupSetup,
    useWazzupStatus,
} from '../api/instagram';
import {
    channelStateLabel,
    chatTitle,
    checkReplyText,
    directWindow,
    effectiveOutboxStatus,
    formatMoment,
    groupCommentsByPost,
    humanDuration,
    isChannelHealthy,
    MESSAGE_STATUS_LABELS,
    normalizeOutgoingText,
    outboxLabel,
    postPreview,
    privateReplyUsed,
    privateReplyWindow,
    PUBLIC_REPLY_HINT,
    visibleOutbox,
    type ChatKind,
    type ChatRow,
    type MessageRow,
    type SendMode,
    type WindowHint,
} from '../lib/instagram';

const TONE_CLASS: Record<WindowHint['tone'], string> = {
    ok: 'text-muted-foreground',
    warn: 'text-amber-700',
    closed: 'text-destructive',
    none: 'text-amber-700',
};

const CONFIRM_REPLACE = 'заменить';

const newDraftKey = (): string => crypto.randomUUID();

/** Каналы Wazzup и кнопка «Подключить приём». */
const ChannelsCard: FC = () => {
    const { data: status } = useWazzupStatus();
    const { data: channels = [], error } = useChannels();
    const setup = useWazzupSetup();
    const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
    const [foreign, setForeign] = useState<string | null>(null);
    const notConfigured = status ? !status.configured : false;

    const run = (subscribe: boolean, confirm?: string) =>
        setup
            .mutateAsync({ subscribe, confirm })
            .then((result) => {
                setForeign(null);
                setNote(
                    result.subscription
                        ? { ok: result.subscription.ok, text: result.subscription.message }
                        : { ok: true, text: `Каналов в Wazzup: ${result.channels.length}` },
                );
            })
            .catch((e: unknown) => {
                if (e instanceof ApiError && e.data?.needsConfirm) setForeign(String(e.data.current ?? ''));
                setNote({ ok: false, text: e instanceof Error ? e.message : 'Не получилось' });
            });

    return (
        <Card className="bg-white/90">
            <CardHeader className="p-4">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>Подключение Wazzup</span>
                    <span className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            size="sm"
                            disabled={setup.isPending || notConfigured || !!status?.subscribeBlocker}
                            onClick={() => run(true)}
                        >
                            <PlugZap className="size-4" />
                            {setup.isPending ? 'Подключаю…' : 'Подключить приём'}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={setup.isPending || notConfigured}
                            onClick={() => run(false)}
                        >
                            <RefreshCw className="size-4" />
                            Обновить каналы
                        </Button>
                    </span>
                </CardTitle>
                <CardDescription>
                    Сначала «Обновить каналы», потом «Подключить приём» — он говорит Wazzup, куда присылать сообщения.
                    Нажимать один раз после настройки ключа или если сообщения перестали приходить.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0 text-sm">
                {notConfigured && <p className="text-amber-700">Wazzup на этом контуре не подключён.</p>}
                {!notConfigured && status?.subscribeBlocker && (
                    <p className="text-muted-foreground">{status.subscribeBlocker}</p>
                )}
                {note && <p className={note.ok ? 'text-green-700' : 'text-destructive'}>{note.text}</p>}
                {foreign !== null && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 p-2">
                        <span>Заменить адрес {foreign} на адрес нашей программы?</span>
                        <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={setup.isPending}
                            onClick={() => run(true, CONFIRM_REPLACE)}
                        >
                            Заменить адрес
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setForeign(null)}>
                            Отмена
                        </Button>
                    </div>
                )}
                {error && <p className="text-destructive">Каналы не загрузились: {error.message}</p>}
                {channels.length === 0 ? (
                    <p className="text-muted-foreground">Каналов пока нет — нажмите «Обновить каналы».</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {channels.map((c) => (
                            <Badge key={c.external_id} variant={isChannelHealthy(c.state) ? 'secondary' : 'destructive'}>
                                {c.transport ?? 'канал'} {c.plain_id ?? ''} · {channelStateLabel(c.state)}
                            </Badge>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

type Pinned = Pick<MessageRow, 'external_id' | 'text' | 'sent_at'>;

/** Переписка одного чата и поле ответа. */
const ChatPanel: FC<{ row: ChatRow; nowMs: number; missing: boolean }> = ({ row, nowMs, missing }) => {
    const { data: messages = [], isPending } = useChatMessages(row.chat_id);
    const { data: outbox = [] } = useChatOutbox(row.chat_id);
    const send = useSendReply();
    const [text, setText] = useState('');
    const [mode, setMode] = useState<SendMode>(row.kind === 'direct' ? 'direct' : 'comment_public');
    // Ключ черновика: живёт до успеха или правки текста. Повторное нажатие
    // с тем же ключом сервер второй раз не отправит.
    const [draftKey, setDraftKey] = useState<string | null>(null);
    // Запрос оборвался или ответ «могло уйти»: обычная кнопка выключена,
    // новый ключ создаёт только «Отправить ещё раз».
    const [uncertain, setUncertain] = useState<string | null>(null);
    // Комментарий, на который отвечаем, закрепляется при начале набора:
    // новый комментарий, пришедший во время набора, не подменит адресата.
    const [pinned, setPinned] = useState<Pinned | null>(null);

    const echoed = useMemo(() => new Set(messages.map((m) => m.external_id)), [messages]);
    const pendingRows = useMemo(() => visibleOutbox(outbox, echoed), [outbox, echoed]);

    const lastInbound = useMemo<Pinned | null>(() => {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            if (messages[i].direction === 'in' && !messages[i].is_deleted) return messages[i];
        }

        return row.last_inbound_external_id
            ? { external_id: row.last_inbound_external_id, text: null, sent_at: row.last_inbound_at ?? '' }
            : null;
    }, [messages, row.last_inbound_external_id, row.last_inbound_at]);
    const target = pinned ?? lastInbound;
    const refExternalId = target?.external_id ?? null;
    const refAt = target?.sent_at || null;

    const outgoing = normalizeOutgoingText(text);
    const check = checkReplyText(outgoing, row.chat_type);
    const used =
        privateReplyUsed(outbox, refExternalId) ||
        (row.private_reply_used && row.last_inbound_external_id === refExternalId);
    // До установки времени окна не показываем: иначе первый кадр посчитал бы
    // от 1970 года и напугал бы «сроком, который прошёл».
    let hint: WindowHint | null = null;
    if (nowMs > 0) {
        if (row.kind === 'direct') hint = directWindow(lastInbound?.sent_at || row.last_inbound_at, nowMs);
        else if (mode === 'comment_private') hint = privateReplyWindow(refAt, used, nowMs);
        else hint = { tone: 'ok', remainingMs: null, text: PUBLIC_REPLY_HINT };
    }
    const needsRef = mode !== 'direct';
    const canSend = check.ok && !send.isPending && !uncertain && (!needsRef || !!refExternalId);

    const onTextChange = (value: string) => {
        setText(value);
        // Правка текста — это новый черновик.
        setDraftKey(null);
        setUncertain(null);
        if (!value.trim()) setPinned(null);
        else if (!pinned && lastInbound) setPinned(lastInbound);
    };

    const submit = (key: string) => {
        setDraftKey(key);
        send.mutateAsync({
            draftId: key,
            chatId: row.chat_id,
            mode,
            text: outgoing,
            refExternalId: needsRef ? refExternalId : null,
        })
            .then((result) => {
                if (result.status === 'sent') {
                    setText('');
                    setDraftKey(null);
                    setUncertain(null);
                    setPinned(null);
                    showToast(result.repeated ? 'Это сообщение уже отправлено' : 'Отправлено', 'success');
                } else if (result.status === 'failed') {
                    // Точно не ушло: следующая попытка — новый черновик.
                    setDraftKey(null);
                    showToast(result.error ?? 'Не ушло', 'error');
                } else {
                    setUncertain(
                        result.status === 'pending'
                            ? 'Сообщение ещё отправляется — подождите и проверьте в Instagram.'
                            : 'Связь оборвалась — проверьте в Instagram, сообщение могло уйти.',
                    );
                }
            })
            .catch((e: unknown) => {
                // Понятный отказ сервера (400/403/409) — ничего не ушло.
                if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
                    setDraftKey(null);
                    showToast(e.message, 'error');

                    return;
                }
                setUncertain('Не получили ответ сервера — проверьте в Instagram, сообщение могло уйти.');
            });
    };

    return (
        <Card className="flex h-full flex-col bg-white/90">
            <CardHeader className="p-4">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>
                        {chatTitle(row)}
                        {row.contact_username && row.contact_name && (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">@{row.contact_username}</span>
                        )}
                    </span>
                    <Badge variant="outline">{row.kind === 'direct' ? 'Direct' : 'Комментарий'}</Badge>
                </CardTitle>
                <CardDescription className="space-y-1">
                    {missing && (
                        <span className="block text-amber-700">Чат выпал из списка при обновлении — текст сохранён.</span>
                    )}
                    {row.kind === 'direct' ? (
                        <span className="block">
                            Клиент: {row.client_name ?? '—'}
                            {row.is_provisional && <span className="ml-1 text-amber-700">(временная карточка)</span>}
                            <span className="block text-xs">
                                Привязан к нику Instagram. Ник может смениться — тогда появится новый чат и новая карточка.
                            </span>
                        </span>
                    ) : (
                        <span className="block">
                            Пост: {postPreview(row.post_description)}{' '}
                            {row.post_src && (
                                <a href={row.post_src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                                    открыть <ExternalLink className="size-3" />
                                </a>
                            )}
                        </span>
                    )}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-4 pt-0">
                <div className="max-h-[50vh] min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-2 text-sm">
                    {isPending && <p className="text-muted-foreground">Загрузка…</p>}
                    {messages.map((m) => (
                        <div
                            key={m.id}
                            className={`max-w-[85%] rounded-lg px-3 py-2 ${m.direction === 'in' ? 'bg-white' : 'ml-auto bg-green-50'}`}
                        >
                            <div className="text-[11px] text-muted-foreground">
                                {m.direction === 'in' ? 'Клиент' : (m.author_name ?? (m.sent_from_app ? 'из Wazzup' : 'Мы'))} ·{' '}
                                {formatMoment(m.sent_at)}
                                {m.direction === 'out' && m.status && MESSAGE_STATUS_LABELS[m.status]
                                    ? ` · ${MESSAGE_STATUS_LABELS[m.status]}`
                                    : ''}
                                {m.is_edited ? ' · изменено' : ''}
                            </div>
                            {m.is_deleted && <div className="italic text-muted-foreground">сообщение удалено</div>}
                            {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
                            {m.content_uri && (
                                <a href={m.content_uri} target="_blank" rel="noreferrer" className="text-xs underline">
                                    вложение ({m.type ?? 'файл'})
                                </a>
                            )}
                            {m.error && <div className="text-xs text-destructive">{m.error}</div>}
                        </div>
                    ))}
                    {pendingRows.map((o) => {
                        const status = nowMs > 0 ? effectiveOutboxStatus(o, nowMs) : o.status;

                        return (
                            <div key={o.id} className="ml-auto max-w-[85%] rounded-lg border border-dashed px-3 py-2">
                                <div
                                    className={`text-[11px] ${status === 'failed' ? 'text-destructive' : status === 'unknown' ? 'text-amber-700' : 'text-muted-foreground'}`}
                                >
                                    {outboxLabel({ status, mode: o.mode })} · {formatMoment(o.created_at)}
                                </div>
                                <div className="whitespace-pre-wrap">{o.text}</div>
                                {o.error && <div className="text-xs text-destructive">{o.error}</div>}
                            </div>
                        );
                    })}
                    {!isPending && messages.length === 0 && pendingRows.length === 0 && (
                        <p className="text-muted-foreground">Сообщений нет.</p>
                    )}
                </div>

                {row.kind === 'comment' && (
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant={mode === 'comment_public' ? 'default' : 'outline'}
                            onClick={() => {
                                setMode('comment_public');
                                setDraftKey(null);
                            }}
                        >
                            Ответить под постом
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={mode === 'comment_private' ? 'default' : 'outline'}
                            onClick={() => {
                                setMode('comment_private');
                                setDraftKey(null);
                            }}
                        >
                            Написать в Direct
                        </Button>
                    </div>
                )}
                {row.kind === 'comment' && target && (
                    <p className="text-xs text-muted-foreground">
                        Отвечаете на: «{postPreview(target.text, 80)}»{pinned ? ' (закреплено на время набора)' : ''}
                    </p>
                )}
                {hint && <p className={`text-xs ${TONE_CLASS[hint.tone]}`}>{hint.text}</p>}
                {row.kind === 'comment' && (
                    <p className="text-xs text-muted-foreground">
                        Как именно Wazzup разводит ответ «под постом» и «в Direct», проверим на пробном периоде.
                    </p>
                )}

                <Textarea
                    rows={3}
                    placeholder={mode === 'comment_public' ? 'Ответ под постом — его увидят все' : 'Ответ клиенту в Direct'}
                    value={text}
                    onChange={(e) => onTextChange(e.target.value)}
                />
                {uncertain && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                        <span>{uncertain}</span>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={send.isPending || !check.ok}
                            onClick={() => {
                                setUncertain(null);
                                submit(newDraftKey());
                            }}
                        >
                            Отправить ещё раз
                        </Button>
                    </div>
                )}
                <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs ${check.length > check.limit ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {check.length} / {check.limit}
                    </span>
                    <Button type="button" size="sm" disabled={!canSend} onClick={() => submit(draftKey ?? newDraftKey())}>
                        <Send className="size-4" />
                        {send.isPending ? 'Отправляю…' : 'Отправить'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

const ChatButton: FC<{ row: ChatRow; active: boolean; nowMs: number; onClick: () => void }> = ({
    row,
    active,
    nowMs,
    onClick,
}) => {
    const waitingMs = row.waiting_since && nowMs > 0 ? Math.max(0, nowMs - Date.parse(row.waiting_since)) : null;

    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full rounded-lg border p-3 text-left text-sm ${active ? 'border-primary bg-muted/50' : 'bg-white hover:bg-muted/30'}`}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{chatTitle(row)}</span>
                {waitingMs !== null && (
                    <Badge variant={waitingMs >= 3_600_000 ? 'destructive' : 'secondary'}>ждёт {humanDuration(waitingMs)}</Badge>
                )}
            </div>
            <div className="truncate text-muted-foreground">
                {row.last_direction === 'out' ? 'Мы: ' : ''}
                {row.last_text || (row.last_type && row.last_type !== 'text' ? `[${row.last_type}]` : '—')}
            </div>
            <div className="text-xs text-muted-foreground">{formatMoment(row.last_message_at)}</div>
        </button>
    );
};

/**
 * Instagram через Wazzup: Direct и комментарии под постами. Первый мессенджер,
 * переехавший из ОКО. Пока только для admin.
 */
export const InstagramPage = () => {
    const user = useUnit($user);
    const [tab, setTab] = useState<ChatKind>('direct');
    // Выбранный чат держим снимком: если при обновлении он выпадет из списка,
    // панель не закроется и набранный текст не пропадёт.
    const [selected, setSelected] = useState<ChatRow | null>(null);
    const [nowMs, setNowMs] = useState(0);
    useEffect(() => {
        setNowMs(Date.now());
        const timer = setInterval(() => setNowMs(Date.now()), 30_000);

        return () => clearInterval(timer);
    }, []);

    // Не-admin база всё равно откажет; не шлём запросы зря.
    const allowed = isInstagramEnabled(user?.role);
    const directQuery = useInstagramChats('direct', allowed);
    const commentQuery = useInstagramChats('comment', allowed);
    const active = tab === 'direct' ? directQuery : commentQuery;
    const rows = useMemo(() => active.data ?? [], [active.data]);
    const groups = useMemo(() => (tab === 'comment' ? groupCommentsByPost(rows) : []), [rows, tab]);
    const waitingDirect = (directQuery.data ?? []).filter((r) => r.waiting_since).length;
    const waitingComments = (commentQuery.data ?? []).filter((r) => r.waiting_since).length;

    // Свежая строка выбранного чата — из любой вкладки; нет — остаётся снимок.
    const fresh = useMemo(() => {
        if (!selected) return null;

        return (
            [...(directQuery.data ?? []), ...(commentQuery.data ?? [])].find((r) => r.chat_id === selected.chat_id) ?? null
        );
    }, [selected, directQuery.data, commentQuery.data]);
    const panelRow = fresh ?? selected;
    const listsLoaded = !!directQuery.data && !!commentQuery.data;

    if (!allowed) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Instagram</CardTitle>
                    <CardDescription>Раздел пока открыт только администратору.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-4 px-2 pb-8 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/90 p-4 shadow-sm">
                <div>
                    <h1 className="text-2xl font-semibold">Instagram</h1>
                    <p className="text-sm text-muted-foreground">
                        Direct и комментарии через Wazzup. Отправляет человек; писать первым Instagram не разрешает.
                    </p>
                </div>
                <Button type="button" variant="outline" onClick={() => active.refetch()} disabled={active.isFetching}>
                    <RefreshCw className={`size-4 ${active.isFetching ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            <ChannelsCard />

            <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={tab === 'direct' ? 'default' : 'outline'} onClick={() => setTab('direct')}>
                    Direct
                    <Badge variant="secondary" className="ml-1">
                        {waitingDirect}
                    </Badge>
                </Button>
                <Button type="button" size="sm" variant={tab === 'comment' ? 'default' : 'outline'} onClick={() => setTab('comment')}>
                    Комментарии
                    <Badge variant="secondary" className="ml-1">
                        {waitingComments}
                    </Badge>
                </Button>
            </div>

            {active.error && (
                <p className="text-sm text-destructive">
                    Не удалось загрузить: {active.error instanceof Error ? active.error.message : 'ошибка'}
                </p>
            )}
            {active.isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
                <div className="max-h-[75vh] space-y-2 overflow-y-auto">
                    {tab === 'direct' &&
                        rows.map((row) => (
                            <ChatButton
                                key={row.chat_id}
                                row={row}
                                nowMs={nowMs}
                                active={panelRow?.chat_id === row.chat_id}
                                onClick={() => setSelected(row)}
                            />
                        ))}
                    {tab === 'comment' &&
                        groups.map((group) => (
                            <div key={group.key} className="space-y-2 rounded-xl border bg-white/60 p-2">
                                <div className="flex items-start justify-between gap-2 px-1 text-sm">
                                    <span className="font-medium">{postPreview(group.description)}</span>
                                    {group.src && (
                                        <a
                                            href={group.src}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex shrink-0 items-center gap-1 text-xs underline"
                                        >
                                            пост <ExternalLink className="size-3" />
                                        </a>
                                    )}
                                </div>
                                {group.chats.map((row) => (
                                    <ChatButton
                                        key={row.chat_id}
                                        row={row}
                                        nowMs={nowMs}
                                        active={panelRow?.chat_id === row.chat_id}
                                        onClick={() => setSelected(row)}
                                    />
                                ))}
                            </div>
                        ))}
                    {!active.isPending && rows.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                            {tab === 'direct'
                                ? 'Сообщений в Direct пока нет. Они появятся, когда приём подключён и клиент напишет.'
                                : 'Комментариев пока нет.'}
                        </p>
                    )}
                </div>

                <div className="min-h-[50vh]">
                    {panelRow ? (
                        // key обязателен: без него набранный текст и выбранный
                        // способ ответа переехали бы в другой чат.
                        <ChatPanel key={panelRow.chat_id} row={panelRow} nowMs={nowMs} missing={listsLoaded && !fresh} />
                    ) : (
                        <Card className="bg-white/90">
                            <CardContent className="p-4 text-sm text-muted-foreground">Выберите чат слева.</CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};
