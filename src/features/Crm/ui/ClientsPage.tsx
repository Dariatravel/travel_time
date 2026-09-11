'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { isCrmEnabled } from '@/shared/config/featureFlags';
import { $user } from '@/shared/models/auth';
import { TravelDialog } from '@/shared/ui/TravelDialog/TravelDialog';
import dayjs from 'dayjs';
import { useUnit } from 'effector-react/compat';
import { Search } from 'lucide-react';
import { FC, useEffect, useState } from 'react';

import { useClientDeals, useClients } from '../api/crm';
import { dealTitle, formatDate, formatMoney, STAGE_LABELS, type ClientRow, type DealRow } from '../lib/crm';
import { DealModal } from './DealModal';

const RESPONSIBLES = ['Анастасия Семенова', 'Варвара', 'Виктория', 'Дарья Ботова', 'Лера', 'Май Анастасия', 'Настя', 'Светлана/Вероника'];

const ClientDialog: FC<{ client: ClientRow; onClose: () => void; actor: string }> = ({ client, onClose, actor }) => {
    const { data: deals = [], isPending } = useClientDeals(client.id);
    const [deal, setDeal] = useState<DealRow | null>(null);

    return (
        <>
            <TravelDialog
                isOpen
                onClose={onClose}
                title={client.name ?? 'Контакт'}
                description={
                    <div className="space-y-3 text-sm">
                        <div>
                            <div className="text-xs text-muted-foreground">Телефоны</div>
                            <div>{client.phones.join(', ') || '—'}</div>
                        </div>
                        {client.emails.length > 0 && (
                            <div>
                                <div className="text-xs text-muted-foreground">E-mails</div>
                                <div>{client.emails.join(', ')}</div>
                            </div>
                        )}
                        <div>
                            <div className="text-xs text-muted-foreground">Ответственный</div>
                            <div>{client.responsible ?? '—'}</div>
                        </div>
                        <div>
                            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Сделки</div>
                            {isPending && <div className="text-muted-foreground">Загрузка…</div>}
                            {!isPending && deals.length === 0 && <div className="text-muted-foreground">Сделок нет.</div>}
                            <div className="space-y-2">
                                {deals.map((d) => (
                                    <button
                                        key={d.id}
                                        type="button"
                                        onClick={() => setDeal(d)}
                                        className="block w-full rounded-lg border bg-white p-2 text-left hover:bg-muted/40"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium">{dealTitle(d)}</span>
                                            <Badge variant="secondary">{STAGE_LABELS[d.stage]}</Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {d.hotel_title ?? '—'} · {formatDate(d.check_in)} – {formatDate(d.check_out)} · {formatMoney(d.total)}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        {client.oko_url && (
                            <a className="text-xs underline" href={client.oko_url} target="_blank" rel="noreferrer">
                                Открыть в OKO
                            </a>
                        )}
                    </div>
                }
                footer={
                    <Button type="button" variant="outline" onClick={onClose}>
                        Закрыть
                    </Button>
                }
            />
            {deal && <DealModal isOpen onClose={() => setDeal(null)} deal={deal} actor={actor} responsibles={RESPONSIBLES} />}
        </>
    );
};

/** Контакты — таблица как в OKO: ФИО · Телефоны · E-mails · Ответственный, поиск по имени или номеру. */
export const ClientsPage = () => {
    const user = useUnit($user);
    const actor = [user?.name, user?.surname].filter(Boolean).join(' ') || 'менеджер';
    const [input, setInput] = useState('');
    const [term, setTerm] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => setTerm(input), 400);

        return () => clearTimeout(timer);
    }, [input]);
    const { data: clients = [], isPending, error } = useClients(term);
    const [selected, setSelected] = useState<ClientRow | null>(null);

    if (!isCrmEnabled(user?.role)) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Клиенты</CardTitle>
                    <CardDescription>Раздел пока открыт только администратору.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="mx-auto max-w-6xl space-y-4 px-2 pb-8 sm:px-4">
            <Card className="bg-white/90">
                <CardHeader className="p-4">
                    <CardTitle>Контакты</CardTitle>
                    <CardDescription>Поиск по имени или телефону. Без запроса — последние добавленные.</CardDescription>
                    <div className="relative mt-2">
                        <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                        <Input className="pl-8" placeholder="Иванова или 8 900 …" value={input} onChange={(e) => setInput(e.target.value)} />
                    </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    {error && <p className="text-sm text-destructive">Не удалось загрузить: {error instanceof Error ? error.message : 'ошибка'}</p>}
                    {isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}
                    {!isPending && clients.length === 0 && <p className="text-sm text-muted-foreground">Ничего не найдено.</p>}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                                    <th className="py-2 pr-3">ФИО</th>
                                    <th className="py-2 pr-3">Телефоны</th>
                                    <th className="py-2 pr-3">E-mails</th>
                                    <th className="py-2 pr-3">Ответственный</th>
                                    <th className="py-2 pr-3">Добавлен</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clients.map((c) => (
                                    <tr key={c.id} className="cursor-pointer border-b hover:bg-muted/40" onClick={() => setSelected(c)}>
                                        <td className="py-2 pr-3 font-medium">{c.name ?? '—'}</td>
                                        <td className="py-2 pr-3">{c.phones.join(', ')}</td>
                                        <td className="py-2 pr-3">{c.emails.join(', ')}</td>
                                        <td className="py-2 pr-3">{c.responsible ?? '—'}</td>
                                        <td className="py-2 pr-3 whitespace-nowrap">
                                            {c.oko_created_at ? dayjs(c.oko_created_at).format('DD.MM.YYYY') : c.created_at ? dayjs(c.created_at).format('DD.MM.YYYY') : ''}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
            {selected && <ClientDialog client={selected} onClose={() => setSelected(null)} actor={actor} />}
        </div>
    );
};
