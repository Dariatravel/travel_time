'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { RoomsTable } from '@/features/Hotels/ui/RoomsTable';
import { RoomModal } from '@/features/RoomInfo/ui/RoomModal';
import { formatAssignableUser, useGetUsers } from '@/shared/api/auth/auth';
import { useHotelById } from '@/shared/api/hotel/hotel';
import { RoomDTO } from '@/shared/api/room/room';
import { isObjectCardEnabled } from '@/shared/config/featureFlags';
import { PagesEnum, routes } from '@/shared/config/routes';
import { $user } from '@/shared/models/auth';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useUnit } from 'effector-react/compat';
import Link from 'next/link';
import { FC, useEffect, useMemo, useState } from 'react';

import {
    useCard,
    useInviteHotelier,
    usePlacements,
    useReviewDraft,
    useSaveCard,
    useSavePlacement,
    useSetHotelOwner,
} from '../api/objectCard';
import {
    CHANNELS,
    cleanPublic,
    draftChanges,
    emptyCard,
    PLACEMENT_LABELS,
    TARIFF_LABELS,
    type CardInternal,
    type PlacementStatus,
    type PublicKey,
    type Tariff,
} from '../lib/objectCard';
import { PublicFieldsForm, toFormValues, type PublicFormValues } from './PublicFieldsForm';

const TARIFFS: Tariff[] = ['basic', 'partner', 'exclusive'];
const STATUSES: PlacementStatus[] = ['posted', 'outdated', 'missing'];

/** Доступ отельера: кто привязан, привязать другого, создать вход. */
const AccessTab: FC<{ hotelId: string; hotelTitle: string; ownerId: string | null }> = ({ hotelId, hotelTitle, ownerId }) => {
    const { data: users = [] } = useGetUsers();
    const setOwner = useSetHotelOwner(hotelId);
    const invite = useInviteHotelier();
    const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' });
    const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
    const owner = users.find((u) => u.id === ownerId);

    const generatePassword = () => {
        const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const bytes = new Uint8Array(12);
        crypto.getRandomValues(bytes);
        const raw = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
        // Требование роута: буквы и цифры.
        setForm((f) => ({ ...f, password: `${raw.slice(0, 10)}7a` }));
    };

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Card className="bg-white/90">
                <CardHeader className="p-4">
                    <CardTitle className="text-base">Кто отельер</CardTitle>
                    <CardDescription>
                        {owner ? `${formatAssignableUser(owner)} · ${owner.email ?? ''}` : ownerId ? 'Пользователь без имени' : 'Доступ никому не выдан'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 p-4 pt-0">
                    <Label className="text-xs text-muted-foreground">Привязать существующего пользователя</Label>
                    <Select
                        value={ownerId ?? 'none'}
                        onValueChange={(value) =>
                            setOwner
                                .mutateAsync(value === 'none' ? null : value)
                                .then(() => showToast('Доступ обновлён', 'success'))
                                .catch((e: Error) => showToast(e.message, 'error'))
                        }
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Выберите" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">— никто —</SelectItem>
                            {users.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                    {formatAssignableUser(u)} {u.email ? `· ${u.email}` : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        Отельер видит свой отель в «Мой отель»: правит номера (сразу в шахматке) и предлагает правки
                        описания — они приходят сюда на проверку.
                    </p>
                </CardContent>
            </Card>

            <Card className="bg-white/90">
                <CardHeader className="p-4">
                    <CardTitle className="text-base">Создать вход отельеру</CardTitle>
                    <CardDescription>Вход сразу привязывается к отелю «{hotelTitle}». Пароль показывается один раз.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 p-4 pt-0">
                    {created ? (
                        <div className="rounded-md bg-emerald-50 p-3 text-sm">
                            <div>
                                Вход: <b>{created.email}</b>
                            </div>
                            <div>
                                Пароль: <b className="font-mono">{created.password}</b>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">Передайте отельеру лично. Повторно пароль не показывается.</div>
                        </div>
                    ) : (
                        <>
                            <Input placeholder="E-mail отельера" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                            <Input placeholder="Имя" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            <Input placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                            <div className="flex gap-2">
                                <Input placeholder="Пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                                <Button type="button" variant="outline" onClick={generatePassword}>
                                    Сгенерировать
                                </Button>
                            </div>
                            <Button
                                type="button"
                                disabled={invite.isPending || !form.email || !form.password || !form.name}
                                onClick={() => {
                                    // У отеля уже есть отельер: замена отбирает у него доступ.
                                    const replace = !!ownerId;
                                    if (
                                        replace &&
                                        !window.confirm(
                                            `У отеля уже есть отельер${owner ? ` (${formatAssignableUser(owner)})` : ''}. Создать нового и отобрать доступ у прежнего?`,
                                        )
                                    ) {
                                        return;
                                    }
                                    invite
                                        .mutateAsync({ ...form, hotel_id: hotelId, replace })
                                        .then((h) => {
                                            setCreated({ email: h.email, password: form.password });
                                            showToast('Вход создан и привязан к отелю', 'success');
                                        })
                                        .catch((e: Error) => showToast(e.message, 'error'));
                                }}
                            >
                                {invite.isPending ? 'Создаю…' : 'Создать и привязать'}
                            </Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

/** Где размещён объект — по каналу: статус и ссылка. */
const PlacementsTab: FC<{ hotelId: string; actor: string }> = ({ hotelId, actor }) => {
    const { data: rows = [] } = usePlacements(hotelId, true);
    const save = useSavePlacement(hotelId);
    const [urls, setUrls] = useState<Record<string, string>>({});
    // Из базы подставляем только каналы, которые человек ещё не трогал:
    // сохранение одного канала не должно стирать набранное в других.
    useEffect(() => {
        setUrls((typed) => ({ ...Object.fromEntries(rows.map((r) => [r.channel, r.url ?? ''])), ...typed }));
    }, [rows]);

    return (
        <div className="space-y-2">
            {CHANNELS.map((channel) => {
                const row = rows.find((r) => r.channel === channel.key);
                const status = row?.status ?? 'missing';
                const url = urls[channel.key] ?? '';

                return (
                    <div key={channel.key} className="grid items-center gap-2 rounded-lg border bg-white p-2 sm:grid-cols-[140px_150px_1fr_auto]">
                        <div className="text-sm font-medium">{channel.label}</div>
                        <Select
                            value={status}
                            onValueChange={(value) =>
                                save
                                    .mutateAsync({ channel: channel.key, status: value as PlacementStatus, url, actor })
                                    .catch((e: Error) => showToast(e.message, 'error'))
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {STATUSES.map((s) => (
                                    <SelectItem key={s} value={s}>
                                        {PLACEMENT_LABELS[s]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Input placeholder="Ссылка" value={url} onChange={(e) => setUrls({ ...urls, [channel.key]: e.target.value })} />
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={save.isPending || url === (row?.url ?? '')}
                            onClick={() =>
                                save
                                    .mutateAsync({ channel: channel.key, status, url, actor })
                                    .then(() => showToast('Сохранено', 'success'))
                                    .catch((e: Error) => showToast(e.message, 'error'))
                            }
                        >
                            Сохранить
                        </Button>
                    </div>
                );
            })}
        </div>
    );
};

/** Номера отеля — те же таблица и окно, что в «Отелях»; правка сразу видна в шахматке. */
const RoomsTab: FC<{ hotelId: string }> = ({ hotelId }) => {
    const { data: hotel, isFetching } = useHotelById(hotelId);
    const [open, setOpen] = useState(false);
    const [room, setRoom] = useState<RoomDTO | null>(null);
    const rooms: RoomDTO[] = useMemo(
        () => [...((hotel?.rooms ?? []) as RoomDTO[])].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')),
        [hotel],
    );

    return (
        <div className="space-y-2">
            <RoomsTable
                rooms={rooms}
                isLoading={isFetching}
                hotelId={hotelId}
                onEdit={(r) => {
                    setRoom(r);
                    setOpen(true);
                }}
                onAddRoom={() => {
                    setRoom(null);
                    setOpen(true);
                }}
            />
            {hotel && (
                <RoomModal
                    isOpen={open}
                    onClose={() => {
                        setRoom(null);
                        setOpen(false);
                    }}
                    currentReserve={{ hotel, room }}
                />
            )}
        </div>
    );
};

/** Карточка одного объекта: вкладки для менеджера. */
export const ObjectCardPage: FC<{ hotelId: string }> = ({ hotelId }) => {
    const user = useUnit($user);
    const allowed = isObjectCardEnabled(user?.role);
    const actor = [user?.name, user?.surname].filter(Boolean).join(' ') || 'менеджер';
    const { data: hotel, isPending: hotelPending } = useHotelById(hotelId);
    const { data: card, isPending: cardPending } = useCard(hotelId, allowed);
    const save = useSaveCard(hotelId);
    const review = useReviewDraft(hotelId);

    const current = useMemo(() => card ?? emptyCard(hotelId), [card, hotelId]);
    const [values, setValues] = useState<PublicFormValues>(() => toFormValues(current));
    const [internal, setInternal] = useState<CardInternal>(() => ({
        tariff: current.tariff,
        owner_contact: current.owner_contact,
        prepay_terms: current.prepay_terms,
        internal_note: current.internal_note,
        checked_at: current.checked_at,
    }));
    useEffect(() => {
        setValues(toFormValues(current));
        setInternal({
            tariff: current.tariff,
            owner_contact: current.owner_contact,
            prepay_terms: current.prepay_terms,
            internal_note: current.internal_note,
            checked_at: current.checked_at,
        });
    }, [current]);

    const changes = useMemo(() => draftChanges(current, current.draft), [current]);
    const highlight = useMemo(() => new Set<PublicKey>(changes.map((c) => c.key)), [changes]);

    if (!allowed) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Карточка объекта</CardTitle>
                    <CardDescription>Раздел пока открыт только администратору.</CardDescription>
                </CardHeader>
            </Card>
        );
    }
    if (hotelPending || cardPending) return <p className="p-4 text-sm text-muted-foreground">Загрузка…</p>;
    if (!hotel) return <p className="p-4 text-sm text-destructive">Отель не найден.</p>;

    const onSave = () =>
        save
            .mutateAsync({ publicPart: cleanPublic(values), internalPart: internal, actor })
            .then(() => showToast('Карточка сохранена', 'success'))
            .catch((e: Error) => showToast(e.message, 'error'));

    return (
        <div className="mx-auto max-w-6xl space-y-4 px-2 pb-8 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/90 p-4 shadow-sm">
                <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                        <Link href={routes[PagesEnum.OBJECTS]} className="underline">
                            Объекты
                        </Link>{' '}
                        · карточка
                    </div>
                    <h1 className="truncate text-2xl font-semibold">{hotel.title}</h1>
                    <p className="text-sm text-muted-foreground">
                        {[hotel.city, hotel.address].filter(Boolean).join(', ') || 'адрес не указан'}
                        {hotel.phone ? ` · ${hotel.phone}` : ''}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={current.tariff === 'exclusive' ? 'default' : 'outline'}>{TARIFF_LABELS[current.tariff]}</Badge>
                    {current.draft && <Badge variant="destructive">правка отельера на проверке</Badge>}
                    <Link href={`${routes[PagesEnum.HOTELS]}/${hotel.id}`} className="text-sm underline">
                        Отель в шахматке
                    </Link>
                </div>
            </div>

            <Tabs defaultValue={current.draft ? 'review' : 'public'}>
                <TabsList className="flex-wrap">
                    <TabsTrigger value="public">Для гостей</TabsTrigger>
                    <TabsTrigger value="internal">Внутреннее</TabsTrigger>
                    <TabsTrigger value="placements">Размещение</TabsTrigger>
                    <TabsTrigger value="rooms">Номера</TabsTrigger>
                    <TabsTrigger value="access">Доступ отельера</TabsTrigger>
                    {current.draft && <TabsTrigger value="review">Проверка правки ({changes.length})</TabsTrigger>}
                </TabsList>

                <TabsContent value="public" className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Это увидят гости на сайте и в постах. Базовые поля отеля (название, адрес, телефон) правятся в «Отелях».
                    </p>
                    <PublicFieldsForm values={values} onChange={setValues} highlight={highlight} />
                    <Button type="button" disabled={save.isPending} onClick={onSave}>
                        {save.isPending ? 'Сохраняю…' : 'Сохранить карточку'}
                    </Button>
                </TabsContent>

                <TabsContent value="internal" className="space-y-3">
                    <p className="text-sm text-muted-foreground">Видит только наша команда. Отельеру эти поля не показываются.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <Label className="text-xs text-muted-foreground">Тариф сотрудничества</Label>
                            <Select value={internal.tariff} onValueChange={(v) => setInternal({ ...internal, tariff: v as Tariff })}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TARIFFS.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {TARIFF_LABELS[t]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Данные проверены (дата)</Label>
                            <Input type="date" value={internal.checked_at ?? ''} onChange={(e) => setInternal({ ...internal, checked_at: e.target.value || null })} />
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Контакт хозяина</Label>
                            <Input value={internal.owner_contact ?? ''} onChange={(e) => setInternal({ ...internal, owner_contact: e.target.value })} />
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Предоплата и комиссия (словами)</Label>
                            <Input value={internal.prepay_terms ?? ''} onChange={(e) => setInternal({ ...internal, prepay_terms: e.target.value })} />
                        </div>
                        <div className="sm:col-span-2">
                            <Label className="text-xs text-muted-foreground">Заметки для команды</Label>
                            <Textarea rows={4} value={internal.internal_note ?? ''} onChange={(e) => setInternal({ ...internal, internal_note: e.target.value })} />
                        </div>
                    </div>
                    <Button type="button" disabled={save.isPending} onClick={onSave}>
                        {save.isPending ? 'Сохраняю…' : 'Сохранить карточку'}
                    </Button>
                </TabsContent>

                <TabsContent value="placements">
                    <PlacementsTab hotelId={hotelId} actor={actor} />
                </TabsContent>

                <TabsContent value="rooms">
                    <RoomsTab hotelId={hotelId} />
                </TabsContent>

                <TabsContent value="access">
                    <AccessTab hotelId={hotelId} hotelTitle={hotel.title} ownerId={hotel.user_id ?? null} />
                </TabsContent>

                {current.draft && (
                    <TabsContent value="review" className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Отельер предложил изменить описание{current.draft_at ? ` (${new Date(current.draft_at).toLocaleString('ru-RU')})` : ''}.
                            Подтвердите — и поля заменятся; отклоните — карточка останется прежней.
                        </p>
                        {changes.length === 0 && <p className="text-sm">Правка не отличается от карточки — можно отклонить.</p>}
                        <div className="space-y-2">
                            {changes.map((c) => (
                                <div key={c.key} className="rounded-lg border bg-white p-3 text-sm">
                                    <div className="text-xs text-muted-foreground">{c.label}</div>
                                    <div className="line-through opacity-60">{c.before}</div>
                                    <div className="font-medium">{c.after}</div>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                disabled={review.isPending}
                                onClick={() =>
                                    review
                                        .mutateAsync({ decision: 'approve', draftAt: current.draft_at })
                                        .then((n) =>
                                            showToast(
                                                n > 0 ? 'Правка принята' : 'Отельер прислал новую правку — посмотрите её заново',
                                                n > 0 ? 'success' : 'error',
                                            ),
                                        )
                                        .catch((e: Error) => showToast(e.message, 'error'))
                                }
                            >
                                Принять
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={review.isPending}
                                onClick={() =>
                                    review
                                        .mutateAsync({ decision: 'reject', draftAt: null })
                                        .then(() => showToast('Правка отклонена', 'success'))
                                        .catch((e: Error) => showToast(e.message, 'error'))
                                }
                            >
                                Отклонить
                            </Button>
                        </div>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
};
