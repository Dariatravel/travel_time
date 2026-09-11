'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { CurrentReserveType } from '@/shared/api/reserve/reserve';
import { $user } from '@/shared/models/auth';
import { TravelDialog } from '@/shared/ui/TravelDialog/TravelDialog';
import { showToast } from '@/shared/ui/Toast/Toast';
import dayjs from 'dayjs';
import { useUnit } from 'effector-react/compat';
import { Check, Circle, Download, Send } from 'lucide-react';
import { FC, useEffect, useMemo, useState } from 'react';

import {
    useBookingCard,
    useBookingCardEvents,
    useSaveBookingCard,
    useSendToChat,
} from '../api/bookingCard';
import {
    BOOKING_SOURCES,
    BOOKING_STATUS_LABELS,
    BOOKING_STEP_LABELS,
    bookingSteps,
    buildVoucher,
    chatCaption,
    CLIENT_CHECK_MESSAGE,
    formatMoney,
    hotelierMessage,
    PAYMENT_BANKS,
    transferVoucherFileName,
    voucherFileName,
    type BookingStep,
    type BookingStatus,
    type VoucherKind,
} from '../lib/voucher';
import { downloadBlob, renderTransferVoucherPdf, renderVoucherPdf } from '../lib/voucherPdf';

export interface BookingCardModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentReserve: CurrentReserveType;
}

type CardForm = {
    source: string;
    manager: string;
    voucher_kind: VoucherKind;
    payment_bank: string;
    payment_date: string;
    payment_phone: string;
    service_note: string;
};

const EVENT_LABELS: Record<string, string> = {
    voucher_generated: 'Ваучер сформирован',
    chat_sent: 'Отправлено в чат',
    hotel_notified: 'Отправлено отельеру',
    client_sent: 'Отправлено клиенту',
    status_changed: 'Статус изменён',
    card_saved: 'Карточка сохранена',
};

const formatStamp = (iso?: string | null) => (iso ? dayjs(iso).format('DD.MM HH:mm') : '');

const copyText = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);

        return true;
    } catch {
        return false;
    }
};

const STEP_ORDER: BookingStep[] = ['voucher', 'chat', 'chessmate', 'hotel'];

export const BookingCardModal: FC<BookingCardModalProps> = ({ isOpen, onClose, currentReserve }) => {
    const reserve = currentReserve.reserve;
    const hotel = currentReserve.hotel;
    const room = currentReserve.room;
    const reserveId = reserve?.id;
    const user = useUnit($user);
    const actor = [user?.name, user?.surname].filter(Boolean).join(' ') || 'менеджер';

    const { data: card, isPending: isCardPending } = useBookingCard(reserveId, isOpen);
    const { data: events = [] } = useBookingCardEvents(reserveId, isOpen);
    const saveCard = useSaveBookingCard();
    const sendToChat = useSendToChat();

    const [form, setForm] = useState<CardForm>({
        source: '',
        manager: actor,
        voucher_kind: 'standard',
        payment_bank: '',
        payment_date: '',
        payment_phone: process.env.NEXT_PUBLIC_VOUCHER_PAYMENT_PHONE ?? '',
        service_note: '',
    });
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        if (!card) return;
        setForm({
            source: card.source ?? '',
            manager: card.manager ?? actor,
            voucher_kind: card.voucher_kind ?? 'standard',
            payment_bank: card.payment_bank ?? '',
            payment_date: card.payment_date ?? '',
            payment_phone: card.payment_phone ?? process.env.NEXT_PUBLIC_VOUCHER_PAYMENT_PHONE ?? '',
            service_note: card.service_note ?? '',
        });
        // actor намеренно не в зависимостях: форма заполняется из карточки один раз
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [card]);

    const model = useMemo(() => {
        if (!reserve || !hotel || reserve.start == null || reserve.end == null) return null;

        return buildVoucher({
            reserve: {
                guest: reserve.guest ?? '',
                phone: reserve.phone ?? '',
                start: reserve.start,
                end: reserve.end,
                price: reserve.price ?? 0,
                quantity: reserve.quantity ?? 0,
                prepayment: reserve.prepayment,
                comment: reserve.comment,
            },
            hotel: {
                title: hotel.title ?? '',
                // В базе у отеля есть столбец type («Отель», «Гостевой дом»…),
                // из TS-типа он убран — читаем как есть, если пришёл из select('*').
                type: (hotel as { type?: string | null }).type ?? null,
                address: hotel.address,
                phone: hotel.phone,
            },
            room: room ? { title: room.title } : null,
            card: form,
        });
    }, [reserve, hotel, room, form]);

    const status: BookingStatus = card?.status ?? 'booked';
    const steps = bookingSteps(card, reserve?.created_at ?? null);

    if (!reserveId || !model) return null;

    const patchFromForm = () => ({
        source: form.source || null,
        manager: form.manager || null,
        voucher_kind: form.voucher_kind,
        payment_bank: form.payment_bank || null,
        payment_date: form.payment_date || null,
        payment_phone: form.payment_phone || null,
        service_note: form.service_note || null,
    });

    const run = async (key: string, action: () => Promise<void>) => {
        setBusy(key);
        try {
            await action();
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Не получилось', 'error');
        } finally {
            setBusy(null);
        }
    };

    const onSave = () =>
        run('save', async () => {
            await saveCard.mutateAsync({ reserveId, patch: patchFromForm(), actor });
            showToast('Карточка сохранена', 'success');
        });

    const onDownloadVoucher = () =>
        run('voucher', async () => {
            const blob = await renderVoucherPdf(model);
            const fileName = voucherFileName(model);
            downloadBlob(blob, fileName);
            await saveCard.mutateAsync({
                reserveId,
                patch: { ...patchFromForm(), voucher_generated_at: new Date().toISOString() },
                actor,
                event: { event: 'voucher_generated', details: { file: fileName, kind: model.kind } },
            });
            showToast('Ваучер сформирован и скачан', 'success');
        });

    const onSendChat = () =>
        run('chat', async () => {
            await saveCard.mutateAsync({ reserveId, patch: patchFromForm(), actor });
            const blob = await renderVoucherPdf(model);
            const result = await sendToChat.mutateAsync({
                reserveId,
                kind: status === 'changed' ? 'change' : 'booking',
                caption: chatCaption(model, status === 'changed' ? 'change' : 'booking'),
                file: { blob, name: voucherFileName(model) },
            });
            showToast(
                result.delivery === 'github'
                    ? 'Отправлено через обход — файл появится в чате в течение минуты'
                    : 'Отправлено в чат «Королева Абхазии»',
                'success',
            );
        });

    const onNotifyHotel = () =>
        run('hotel', async () => {
            const copied = await copyText(hotelierMessage(model));
            await saveCard.mutateAsync({
                reserveId,
                patch: { ...patchFromForm(), hotel_notified_at: new Date().toISOString() },
                actor,
                event: { event: 'hotel_notified', details: { hotel: model.hotelTitle } },
            });
            showToast(
                copied
                    ? 'Текст для отельера скопирован — вставьте в чат с отелем вместе с ваучером'
                    : 'Отмечено: отельеру отправлено',
                'success',
            );
        });

    const onMarkClient = () =>
        run('client', async () => {
            const copied = await copyText(CLIENT_CHECK_MESSAGE);
            await saveCard.mutateAsync({
                reserveId,
                patch: { ...patchFromForm(), client_sent_at: new Date().toISOString() },
                actor,
                event: { event: 'client_sent' },
            });
            showToast(
                copied ? 'Реплика клиенту скопирована' : 'Отмечено: клиенту отправлено',
                'success',
            );
        });

    const changeStatus = (next: BookingStatus, label: string) =>
        run(next, async () => {
            if (!window.confirm(`${label}? Это уйдёт в чат «Королева Абхазии».`)) return;

            if (next === 'transferred') {
                const seasonYear = Number(model.checkIn.slice(-4)) || new Date().getFullYear();
                const blob = await renderTransferVoucherPdf(model, seasonYear);
                await sendToChat.mutateAsync({
                    reserveId,
                    kind: 'transfer',
                    caption: chatCaption(model, 'transfer'),
                    file: { blob, name: transferVoucherFileName(model) },
                });
                downloadBlob(blob, transferVoucherFileName(model));
            } else if (next === 'changed') {
                const blob = await renderVoucherPdf(model);
                await sendToChat.mutateAsync({
                    reserveId,
                    kind: 'change',
                    caption: chatCaption(model, 'change'),
                    file: { blob, name: voucherFileName(model) },
                });
            } else if (next === 'cancelled') {
                await sendToChat.mutateAsync({
                    reserveId,
                    kind: 'cancel',
                    caption: chatCaption(model, 'cancel'),
                });
            }

            await saveCard.mutateAsync({
                reserveId,
                patch: {
                    ...patchFromForm(),
                    status: next,
                    ...(next === 'changed' ? { voucher_generated_at: new Date().toISOString() } : {}),
                },
                actor,
                event: { event: 'status_changed', details: { from: status, to: next } },
            });
            showToast(`Статус: ${BOOKING_STATUS_LABELS[next]}`, 'success');
        });

    const field = (label: string, value: string) => (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="truncate">{value || '—'}</span>
        </div>
    );

    const statusVariant = status === 'cancelled' ? 'destructive' : status === 'booked' ? 'default' : 'secondary';

    return (
        <TravelDialog
            isOpen={isOpen}
            onClose={onClose}
            className="sm:max-w-4xl"
            title={
                <span className="flex flex-wrap items-center gap-2">
                    Сделка · {model.guest || 'бронь'}
                    <Badge variant={statusVariant}>{BOOKING_STATUS_LABELS[status]}</Badge>
                    {isCardPending && <span className="text-xs text-muted-foreground">загрузка…</span>}
                </span>
            }
            description={
                <div className="grid gap-6 md:grid-cols-2">
                    {/* Левая панель — как в OKO: «Основное» */}
                    <div className="space-y-3">
                        <div className="text-xs font-semibold uppercase text-muted-foreground">
                            Основное
                        </div>
                        <div className="space-y-1">
                            <Label>Источник</Label>
                            <Select
                                value={form.source || undefined}
                                onValueChange={(value) => setForm((f) => ({ ...f, source: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Выберите значение" />
                                </SelectTrigger>
                                <SelectContent>
                                    {BOOKING_SOURCES.map((source) => (
                                        <SelectItem key={source} value={source}>
                                            {source}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {field('Отель', model.hotelTitle)}
                        {field('Номер', model.roomTitle)}
                        {field('Дата заезда', model.checkIn)}
                        {field('Дата выезда', model.checkOut)}
                        <div className="space-y-1">
                            <Label>Ответственный</Label>
                            <Input
                                value={form.manager}
                                onChange={(event) => setForm((f) => ({ ...f, manager: event.target.value }))}
                            />
                        </div>
                        {field('Количество человек в номере', String(model.people))}
                        {field('Стоимость номера за сутки', `${formatMoney(model.pricePerNight)} ₽`)}
                        {field('Количество ночей', String(model.nights))}
                        <div className="space-y-1">
                            <Label>Услуга закрепления выбранного номера</Label>
                            <Input
                                value={form.service_note}
                                placeholder="Введите значение"
                                onChange={(event) =>
                                    setForm((f) => ({ ...f, service_note: event.target.value }))
                                }
                            />
                        </div>
                        {field('Сумма сделки', `${formatMoney(model.total)} ₽`)}
                        {field('Оплачено гостем (услуга бронирования)', `${formatMoney(model.prepaid)} ₽`)}
                        {field('К оплате при заселении', `${formatMoney(model.toPay)} ₽`)}
                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label>Перевод на карту</Label>
                                <Select
                                    value={form.payment_bank || undefined}
                                    onValueChange={(value) =>
                                        setForm((f) => ({ ...f, payment_bank: value }))
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Банк" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PAYMENT_BANKS.map((bank) => (
                                            <SelectItem key={bank} value={bank}>
                                                {bank}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label>Дата брони (платежа)</Label>
                                <Input
                                    type="date"
                                    value={form.payment_date}
                                    onChange={(event) =>
                                        setForm((f) => ({ ...f, payment_date: event.target.value }))
                                    }
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Телефон получателя перевода</Label>
                            <Input
                                value={form.payment_phone}
                                onChange={(event) =>
                                    setForm((f) => ({ ...f, payment_phone: event.target.value }))
                                }
                            />
                        </div>
                        {field('Комментарий', model.comment)}
                        <div className="space-y-1">
                            <Label>Вид ваучера</Label>
                            <Select
                                value={form.voucher_kind}
                                onValueChange={(value) =>
                                    setForm((f) => ({ ...f, voucher_kind: value as VoucherKind }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="standard">Обычный (возврат 50% за 30 дней)</SelectItem>
                                    <SelectItem value="nonrefundable">Невозвратный</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            Гость, телефон, даты и суммы берутся из брони — менять их в форме брони.
                        </div>
                    </div>

                    {/* Правая панель — чек-лист и лента */}
                    <div className="space-y-4">
                        <div>
                            <div className="text-xs font-semibold uppercase text-muted-foreground">
                                Четыре действия после оплаты
                            </div>
                            <ul className="mt-2 space-y-2">
                                {STEP_ORDER.map((step) => {
                                    const done = steps[step];

                                    return (
                                        <li key={step} className="flex items-center gap-2 text-sm">
                                            {done ? (
                                                <Check className="size-4 text-green-600" />
                                            ) : (
                                                <Circle className="size-4 text-muted-foreground" />
                                            )}
                                            <span className={done ? '' : 'font-medium'}>
                                                {BOOKING_STEP_LABELS[step]}
                                            </span>
                                            {done && (
                                                <span className="text-xs text-muted-foreground">
                                                    {formatStamp(done)}
                                                </span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        <div className="grid gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={!!busy}
                                onClick={onDownloadVoucher}
                            >
                                <Download className="size-4" />
                                {busy === 'voucher' ? 'Формирую…' : 'Ваучер (PDF)'}
                            </Button>
                            <Button type="button" disabled={!!busy} onClick={onSendChat}>
                                <Send className="size-4" />
                                {busy === 'chat' ? 'Отправляю…' : 'Отправить в чат #бронь'}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={!!busy}
                                onClick={onNotifyHotel}
                            >
                                Отельеру: скопировать текст
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={!!busy}
                                onClick={onMarkClient}
                            >
                                Клиенту: скопировать реплику
                            </Button>
                        </div>

                        {status !== 'cancelled' && (
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    disabled={!!busy}
                                    onClick={() => changeStatus('changed', 'Изменения в брони')}
                                >
                                    Изменения
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    disabled={!!busy}
                                    onClick={() => changeStatus('transferred', 'Перенос брони')}
                                >
                                    Перенос
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    disabled={!!busy}
                                    onClick={() => changeStatus('cancelled', 'Отмена брони')}
                                >
                                    Отмена
                                </Button>
                            </div>
                        )}

                        <div>
                            <div className="text-xs font-semibold uppercase text-muted-foreground">
                                Лента
                            </div>
                            {events.length === 0 ? (
                                <div className="mt-2 text-sm text-muted-foreground">Пока пусто</div>
                            ) : (
                                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm">
                                    {events.map((event) => (
                                        <li key={event.id} className="flex gap-2">
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                {formatStamp(event.created_at)}
                                            </span>
                                            <span>
                                                {EVENT_LABELS[event.event] ?? event.event}
                                                {event.created_by ? ` — ${event.created_by}` : ''}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            }
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Закрыть
                    </Button>
                    <Button type="button" disabled={!!busy} onClick={onSave}>
                        {busy === 'save' ? 'Сохраняю…' : 'Сохранить'}
                    </Button>
                </>
            }
        />
    );
};
