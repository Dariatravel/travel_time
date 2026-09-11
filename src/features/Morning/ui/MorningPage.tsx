'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { BookingCardModal } from '@/features/BookingCard/ui/BookingCardModal';
import type { CurrentReserveType } from '@/shared/api/reserve/reserve';
import { isMorningEnabled } from '@/shared/config/featureFlags';
import { PagesEnum, routes } from '@/shared/config/routes';
import { parsePrepayment } from '@/shared/lib/parsePrepayment';
import { $user } from '@/shared/models/auth';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useUnit } from 'effector-react/compat';
import { Copy, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { FC, useEffect, useMemo, useState } from 'react';

import {
    useMarkTouchpoint,
    useMessageTemplates,
    useMorningReserves,
    useSaveTemplate,
    type MessageTemplate,
} from '../api/morning';
import {
    ACTION_LABELS,
    buildMorningBoard,
    cardOf,
    DONE_LABELS,
    fillTemplate,
    formatDay,
    moscowDay,
    TASK_ACTIONS,
    TASK_LABELS,
    touchpointPatch,
    type MorningReserve,
    type MorningTask,
    type TouchpointKind,
    type TouchpointStatus,
} from '../lib/morning';

const TEMPLATE_KEY_BY_KIND: Partial<Record<TouchpointKind, string>> = {
    reminder: 'arrival_reminder',
    review_request: 'review_request',
};

const period = (reserve: MorningReserve) =>
    `${formatDay(moscowDay(reserve.start))} – ${formatDay(moscowDay(reserve.end))}`;

const prepaymentLabel = (reserve: MorningReserve) => {
    const prepaid = parsePrepayment(reserve.prepayment);
    if (prepaid <= 0) return 'Нет предоплаты';
    const nights = Math.max(0, moscowDay(reserve.end) - moscowDay(reserve.start));
    const rest = reserve.price * nights - prepaid;

    return rest > 0 ? `Остаток ${rest} ₽` : 'Оплачено';
};

const copyText = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);

        return true;
    } catch {
        return false;
    }
};

const toCurrentReserve = (reserve: MorningReserve): CurrentReserveType =>
    ({
        reserve: {
            id: reserve.id,
            room_id: reserve.rooms?.id ?? '',
            guest: reserve.guest,
            phone: reserve.phone,
            start: reserve.start,
            end: reserve.end,
            price: reserve.price,
            quantity: reserve.quantity,
            prepayment: reserve.prepayment,
            created_at: reserve.created_at ?? undefined,
        },
        room: reserve.rooms ? { id: reserve.rooms.id, title: reserve.rooms.title } : null,
        hotel: reserve.rooms?.hotels
            ? {
                  id: reserve.rooms.hotels.id,
                  title: reserve.rooms.hotels.title,
                  address: reserve.rooms.hotels.address ?? '',
                  phone: reserve.rooms.hotels.phone ?? '',
              }
            : null,
    }) as CurrentReserveType;

const ReserveLine: FC<{ reserve: MorningReserve; onOpen?: (reserve: MorningReserve) => void }> = ({
    reserve,
    onOpen,
}) => {
    const card = cardOf(reserve);

    return (
        <div className="rounded-lg border bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{reserve.guest}</span>
                <span className="flex items-center gap-2">
                    {card?.status && card.status !== 'booked' && <Badge variant="secondary">{card.status}</Badge>}
                    {reserve.external_source && <Badge variant="outline">Интеграция</Badge>}
                    {onOpen && (
                        <Button type="button" size="sm" variant="outline" onClick={() => onOpen(reserve)}>
                            Карточка
                        </Button>
                    )}
                </span>
            </div>
            <div className="text-sm text-muted-foreground">
                {reserve.rooms?.hotels?.title ?? '—'} · {reserve.rooms?.title ?? ''} · {period(reserve)}
            </div>
            <div className="text-sm">
                {reserve.phone || 'Телефон не указан'} · {prepaymentLabel(reserve)}
                {card?.manager ? ` · ${card.manager}` : ''}
            </div>
        </div>
    );
};

const ReserveList: FC<{
    title: string;
    hint: string;
    items: MorningReserve[];
    empty: string;
    tone?: 'default' | 'warning';
    onOpen?: (reserve: MorningReserve) => void;
}> = ({ title, hint, items, empty, tone = 'default', onOpen }) => (
    <Card className={tone === 'warning' ? 'border-amber-200 bg-amber-50/80' : 'bg-white/90'}>
        <CardHeader className="p-4">
            <CardTitle className="text-base">
                {title} <Badge variant="outline">{items.length}</Badge>
            </CardTitle>
            <CardDescription>{hint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{empty}</p>
            ) : (
                items.map((reserve) => <ReserveLine key={reserve.id} reserve={reserve} onOpen={onOpen} />)
            )}
        </CardContent>
    </Card>
);

const dueLabel = (task: MorningTask, today: number) => {
    if (task.overdueDays > 0) return `просрочено ${task.overdueDays} дн.`;
    if (task.dueDay === today) return 'сегодня';

    return `через ${task.dueDay - today} дн.`;
};

const TaskList: FC<{
    kind: TouchpointKind;
    hint: string;
    tasks: MorningTask[];
    today: number;
    template?: MessageTemplate;
    busyKey: string | null;
    onAction: (task: MorningTask, action: TouchpointStatus) => void;
}> = ({ kind, hint, tasks, today, template, busyKey, onAction }) => (
    <Card className="bg-white/90">
        <CardHeader className="p-4">
            <CardTitle className="text-base">
                {TASK_LABELS[kind]} <Badge variant="outline">{tasks.length}</Badge>
            </CardTitle>
            <CardDescription>{hint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
            {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ничего не ждёт.</p>
            ) : (
                tasks.map((task) => {
                    const busy = busyKey === task.key;

                    return (
                        <div
                            key={task.key}
                            className={`rounded-lg border p-3 ${task.overdueDays > 0 ? 'border-red-200 bg-red-50/80' : 'bg-white'}`}
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium">{task.reserve.guest}</span>
                                <Badge variant={task.overdueDays > 0 ? 'destructive' : 'outline'}>
                                    {dueLabel(task, today)}
                                </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {task.reserve.rooms?.hotels?.title ?? '—'} · {period(task.reserve)}
                                {cardOf(task.reserve)?.source ? ` · ${cardOf(task.reserve)?.source}` : ''}
                            </div>
                            <div className="text-sm">{task.reserve.phone}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {template && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={busy}
                                        onClick={async () => {
                                            const ok = await copyText(fillTemplate(template.body, task.reserve));
                                            showToast(ok ? 'Текст скопирован' : 'Не удалось скопировать', ok ? 'success' : 'error');
                                        }}
                                    >
                                        <Copy className="size-4" />
                                        Скопировать текст
                                    </Button>
                                )}
                                {TASK_ACTIONS[kind].map((action) => (
                                    <Button
                                        key={action}
                                        type="button"
                                        size="sm"
                                        variant={
                                            action === 'done' || action === 'review_found'
                                                ? 'default'
                                                : action === 'not_arrived'
                                                  ? 'destructive'
                                                  : 'secondary'
                                        }
                                        disabled={busy}
                                        onClick={() => onAction(task, action)}
                                    >
                                        {action === 'done' ? DONE_LABELS[kind] : ACTION_LABELS[action]}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    );
                })
            )}
        </CardContent>
    </Card>
);

const TemplatesEditor: FC<{ templates: MessageTemplate[]; actor: string }> = ({ templates, actor }) => {
    const save = useSaveTemplate();
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    return (
        <Card className="bg-white/90">
            <CardHeader className="p-4">
                <CardTitle className="text-base">Тексты сообщений гостям</CardTitle>
                <CardDescription>
                    Подставляются {'{имя}'}, {'{отель}'}, {'{заезд}'}, {'{выезд}'}, {'{даты}'}. Кнопка «Скопировать
                    текст» у задачи берёт текст отсюда.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0">
                {templates.map((template) => {
                    const value = drafts[template.key] ?? template.body;
                    const dirty = value !== template.body;

                    return (
                        <div key={template.key} className="space-y-2">
                            <div className="text-sm font-medium">{template.title}</div>
                            <Textarea
                                value={value}
                                rows={5}
                                onChange={(event) =>
                                    setDrafts((d) => ({ ...d, [template.key]: event.target.value }))
                                }
                            />
                            <Button
                                type="button"
                                size="sm"
                                disabled={!dirty || save.isPending}
                                onClick={() =>
                                    save
                                        .mutateAsync({ key: template.key, title: template.title, body: value, actor })
                                        .then(() => {
                                            setDrafts((d) => {
                                                const next = { ...d };
                                                delete next[template.key];

                                                return next;
                                            });
                                            showToast('Текст сохранён', 'success');
                                        })
                                        .catch((error: unknown) =>
                                            showToast(error instanceof Error ? error.message : 'Не сохранилось', 'error'),
                                        )
                                }
                            >
                                Сохранить
                            </Button>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
};

/**
 * «Утро менеджера»: один экран вместо трёх программ. Заезды и выезды дня,
 * напоминания и отзывы (панель Иры), брони без подтверждения отеля и
 * «думающие» клиенты. Ничего не отправляет само — только показывает,
 * копирует текст и записывает отметку менеджера.
 */
export const MorningPage = () => {
    const user = useUnit($user);
    const actor = [user?.name, user?.surname].filter(Boolean).join(' ') || 'менеджер';
    // «Сейчас» берём после монтирования — правило линтера о чистом рендере.
    const [nowUnix, setNowUnix] = useState<number | null>(null);
    useEffect(() => {
        setNowUnix(Math.floor(Date.now() / 1000));
    }, []);

    const { data: reserves = [], isPending, error, refetch, isFetching } = useMorningReserves(nowUnix);
    const { data: templates = [] } = useMessageTemplates();
    const mark = useMarkTouchpoint();
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [selected, setSelected] = useState<MorningReserve | null>(null);
    const selectedReserve = useMemo(() => (selected ? toCurrentReserve(selected) : null), [selected]);

    const board = useMemo(
        () => (nowUnix === null ? null : buildMorningBoard(reserves, nowUnix)),
        [reserves, nowUnix],
    );
    const templateByKey = useMemo(
        () => Object.fromEntries(templates.map((t) => [t.key, t])) as Record<string, MessageTemplate>,
        [templates],
    );

    if (!isMorningEnabled(user?.role)) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Утро менеджера</CardTitle>
                    <CardDescription>Раздел пока открыт только администратору.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const onAction = async (task: MorningTask, action: TouchpointStatus) => {
        if (!board) return;
        if (action === 'not_arrived' && !window.confirm('Отметить, что гость не приехал? Все напоминания по брони закроются.')) {
            return;
        }
        setBusyKey(task.key);
        try {
            await mark.mutateAsync({
                reserveId: task.reserve.id,
                kind: task.kind,
                patch: touchpointPatch(action, board.today, actor, new Date().toISOString()),
            });
            showToast(ACTION_LABELS[action], 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Не получилось', 'error');
        } finally {
            setBusyKey(null);
        }
    };

    const counters = board
        ? [
              { label: 'Заезды', value: board.arrivals.length },
              { label: 'Выезды', value: board.departures.length },
              { label: 'Напомнить', value: board.reminders.length },
              { label: 'Запросить отзыв', value: board.reviewRequests.length },
              { label: 'Проверить отзыв', value: board.reviewChecks.length },
              { label: 'Просрочено', value: board.overdue, warn: board.overdue > 0 },
              { label: 'Без отеля', value: board.unconfirmedByHotel.length, warn: board.unconfirmedByHotel.length > 0 },
              { label: 'Думают', value: board.thinking.length },
          ]
        : [];

    return (
        <div className="mx-auto max-w-7xl space-y-5 px-2 pb-8 sm:px-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-white/90 p-4 shadow-sm">
                <div>
                    <h1 className="text-2xl font-semibold">Утро менеджера</h1>
                    <p className="text-sm text-muted-foreground">
                        Что сделать сегодня: заезды и выезды, напоминания гостям, отзывы, брони без подтверждения
                        отеля. Программа ничего не отправляет сама — вы копируете текст, пишете гостю и отмечаете.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={routes[PagesEnum.BOOKINGS]} className="text-sm underline">
                        Все брони
                    </Link>
                    <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                        <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
                        Обновить
                    </Button>
                </div>
            </div>

            {error && (
                <p className="text-sm text-destructive">
                    Не удалось загрузить: {error instanceof Error ? error.message : 'ошибка'}
                </p>
            )}
            {isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}

            {board && (
                <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                        {counters.map((counter) => (
                            <div
                                key={counter.label}
                                className={`rounded-xl border p-3 ${counter.warn ? 'border-red-200 bg-red-50/80' : 'bg-white/90'}`}
                            >
                                <div className="text-2xl font-semibold">{counter.value}</div>
                                <div className="text-xs text-muted-foreground">{counter.label}</div>
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <ReserveList
                            title="Заезды сегодня"
                            hint="Заезд с 14:00. Проверьте, что отель ждёт гостя."
                            items={board.arrivals}
                            empty="Сегодня заездов нет."
                            onOpen={setSelected}
                        />
                        <ReserveList
                            title="Выезды сегодня"
                            hint="Выезд до 12:00. Через 7 дней появится задача «Запросить отзыв»."
                            items={board.departures}
                            empty="Сегодня выездов нет."
                            onOpen={setSelected}
                        />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <TaskList
                            kind="reminder"
                            hint="За 3 дня до заезда. Скопируйте текст, напишите гостю, отметьте."
                            tasks={board.reminders}
                            today={board.today}
                            template={templateByKey[TEMPLATE_KEY_BY_KIND.reminder ?? '']}
                            busyKey={busyKey}
                            onAction={onAction}
                        />
                        <TaskList
                            kind="review_request"
                            hint="Через 7 дней после выезда."
                            tasks={board.reviewRequests}
                            today={board.today}
                            template={templateByKey[TEMPLATE_KEY_BY_KIND.review_request ?? '']}
                            busyKey={busyKey}
                            onAction={onAction}
                        />
                        <TaskList
                            kind="review_check"
                            hint="Через 2 дня после запроса: посмотрите Яндекс, ВК, Авито."
                            tasks={board.reviewChecks}
                            today={board.today}
                            busyKey={busyKey}
                            onAction={onAction}
                        />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <ReserveList
                            title="Без подтверждения отеля"
                            hint="Отельеру не отправлено — откройте карточку и нажмите «Отельеру»."
                            items={board.unconfirmedByHotel}
                            empty="Все брони отправлены отелям."
                            tone="warning"
                            onOpen={setSelected}
                        />
                        <ReserveList
                            title="Думают дольше 15 часов"
                            hint="Бронь есть, предоплаты нет. Напомните клиенту."
                            items={board.thinking}
                            empty="Никто не завис."
                            onOpen={setSelected}
                        />
                        <ReserveList
                            title="Без телефона"
                            hint="Напомнить некому — допишите телефон в брони."
                            items={board.noPhone}
                            empty="У всех гостей есть телефон."
                            tone="warning"
                        />
                    </div>

                    <TemplatesEditor templates={templates} actor={actor} />
                </>
            )}

            {selectedReserve && (
                <BookingCardModal
                    isOpen={!!selectedReserve}
                    onClose={() => setSelected(null)}
                    currentReserve={selectedReserve}
                />
            )}
        </div>
    );
};
