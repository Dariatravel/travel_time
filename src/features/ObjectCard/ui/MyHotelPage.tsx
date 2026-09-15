'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RoomsTable } from '@/features/Hotels/ui/RoomsTable';
import { RoomModal } from '@/features/RoomInfo/ui/RoomModal';
import { useHotelById } from '@/shared/api/hotel/hotel';
import { RoomDTO } from '@/shared/api/room/room';
import { isMyHotelEnabled } from '@/shared/config/featureFlags';
import { PagesEnum, routes } from '@/shared/config/routes';
import { $user } from '@/shared/models/auth';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useUnit } from 'effector-react/compat';
import Link from 'next/link';
import { FC, useEffect, useMemo, useState } from 'react';

import { useMyHotels, useSubmitDraft } from '../api/objectCard';
import { cleanPublic, draftChanges, withDraft, type HotelierCardRow, type PublicKey } from '../lib/objectCard';
import { PublicFieldsForm, toFormValues, type PublicFormValues } from './PublicFieldsForm';

/** Один отель отельера: описание (на проверку) и номера (сразу в шахматку). */
const MyHotelCard: FC<{ row: HotelierCardRow }> = ({ row }) => {
    const submit = useSubmitDraft();
    // Показываем карточку с уже предложенной правкой поверх — чтобы отельер
    // не терял набранное, пока менеджер проверяет.
    const shown = useMemo(() => withDraft(row, row.draft), [row]);
    const [values, setValues] = useState<PublicFormValues>(() => toFormValues(shown));
    useEffect(() => setValues(toFormValues(shown)), [shown]);
    const pending = useMemo(() => new Set<PublicKey>(draftChanges(row, row.draft).map((c) => c.key)), [row]);

    const { data: hotel, isFetching } = useHotelById(row.hotel_id);
    const [open, setOpen] = useState(false);
    const [room, setRoom] = useState<RoomDTO | null>(null);
    const rooms: RoomDTO[] = useMemo(
        () => [...((hotel?.rooms ?? []) as RoomDTO[])].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')),
        [hotel],
    );

    const onSubmit = () => {
        const draft = cleanPublic(values);
        const changed = draftChanges(row, draft);
        if (changed.length === 0) {
            showToast('Изменений нет', 'error');

            return;
        }
        submit
            .mutateAsync({ hotelId: row.hotel_id, draft })
            .then(() => showToast('Отправлено на проверку менеджеру', 'success'))
            .catch((e: Error) => showToast(e.message, 'error'));
    };

    return (
        <Card className="bg-white/90">
            <CardHeader className="p-4">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>{row.title}</span>
                    <span className="flex items-center gap-2">
                        {row.draft && <Badge variant="secondary">правка на проверке</Badge>}
                        <Link href={`${routes[PagesEnum.HOTELS]}/${row.hotel_id}`} className="text-sm underline">
                            Номера
                        </Link>
                        <Link href={routes[PagesEnum.RESERVATION]} className="text-sm underline">
                            Шахматка
                        </Link>
                    </span>
                </CardTitle>
                <CardDescription>
                    {[row.city, row.address].filter(Boolean).join(', ') || 'адрес не указан'}
                    {row.phone ? ` · ${row.phone}` : ''}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0">
                <div className="space-y-2">
                    <div className="text-sm font-medium">Описание для гостей</div>
                    <p className="text-xs text-muted-foreground">
                        Ваши правки не публикуются сразу: их проверяет менеджер АБХАЗБЕРЕГ. Название, адрес и телефон
                        меняются через менеджера.
                    </p>
                    <PublicFieldsForm values={values} onChange={setValues} highlight={pending} />
                    <Button type="button" disabled={submit.isPending} onClick={onSubmit}>
                        {submit.isPending ? 'Отправляю…' : 'Отправить на проверку'}
                    </Button>
                </div>

                <div className="space-y-2">
                    <div className="text-sm font-medium">Номера и цены</div>
                    <p className="text-xs text-muted-foreground">Номера меняются сразу и тут же видны в шахматке.</p>
                    <RoomsTable
                        rooms={rooms}
                        isLoading={isFetching}
                        hotelId={row.hotel_id}
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
            </CardContent>
        </Card>
    );
};

/** «Мой отель» — кабинет отельера: его отели, описание и номера. */
export const MyHotelPage = () => {
    const user = useUnit($user);
    const allowed = isMyHotelEnabled(user?.role);
    const { data: rows = [], isPending, error } = useMyHotels(allowed);

    if (!allowed) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Мой отель</CardTitle>
                    <CardDescription>Раздел для отельеров.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="mx-auto max-w-5xl space-y-4 px-2 pb-8 sm:px-4">
            <div className="rounded-2xl border bg-white/90 p-4 shadow-sm">
                <h1 className="text-2xl font-semibold">Мой отель</h1>
                <p className="text-sm text-muted-foreground">Описание для гостей, номера и шахматка вашего объекта.</p>
            </div>
            {error && <p className="text-sm text-destructive">Не удалось загрузить: {(error as Error).message}</p>}
            {isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}
            {!isPending && rows.length === 0 && (
                <Card>
                    <CardContent className="p-4 text-sm text-muted-foreground">
                        К вашему входу пока не привязан отель. Напишите менеджеру АБХАЗБЕРЕГ.
                    </CardContent>
                </Card>
            )}
            {rows.map((row) => (
                <MyHotelCard key={row.hotel_id} row={row} />
            ))}
        </div>
    );
};
