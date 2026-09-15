'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { isObjectCardEnabled } from '@/shared/config/featureFlags';
import { PagesEnum, routes } from '@/shared/config/routes';
import { $user } from '@/shared/models/auth';
import { useUnit } from 'effector-react/compat';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useObjectsList } from '../api/objectCard';
import { completeness, TARIFF_LABELS } from '../lib/objectCard';

type Filter = 'all' | 'draft' | 'no_owner' | 'empty';

const FILTER_LABELS: Record<Filter, string> = {
    all: 'Все',
    draft: 'Правка на проверке',
    no_owner: 'Без отельера',
    empty: 'Пустая карточка',
};

/**
 * «Объекты» — список отелей с карточками: тариф, заполненность, есть ли
 * доступ у отельера, ждёт ли проверки его правка.
 */
export const ObjectsPage = () => {
    const user = useUnit($user);
    const allowed = isObjectCardEnabled(user?.role);
    const [term, setTerm] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const { data: items = [], isPending, error } = useObjectsList(allowed);

    const visible = useMemo(() => {
        const q = term.trim().toLowerCase();

        return items.filter(({ hotel, card }) => {
            if (q && !`${hotel.title} ${hotel.city ?? ''} ${hotel.address ?? ''}`.toLowerCase().includes(q)) return false;
            switch (filter) {
                case 'draft':
                    return !!card?.draft;
                case 'no_owner':
                    return !hotel.user_id;
                case 'empty':
                    return !card || completeness(card) === 0;
                default:
                    return true;
            }
        });
    }, [items, term, filter]);

    const counts = useMemo(
        () => ({
            all: items.length,
            draft: items.filter((i) => !!i.card?.draft).length,
            no_owner: items.filter((i) => !i.hotel.user_id).length,
            empty: items.filter((i) => !i.card || completeness(i.card) === 0).length,
        }),
        [items],
    );

    if (!allowed) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Объекты</CardTitle>
                    <CardDescription>Раздел пока открыт только администратору.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="mx-auto max-w-6xl space-y-4 px-2 pb-8 sm:px-4">
            <div className="rounded-2xl border bg-white/90 p-4 shadow-sm">
                <h1 className="text-2xl font-semibold">Объекты</h1>
                <p className="text-sm text-muted-foreground">
                    Карточка объекта: описание для гостей, тариф, где размещён, номера и доступ отельера.
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[240px] flex-1">
                    <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                    <Input className="pl-8" placeholder="Название, город, адрес" value={term} onChange={(e) => setTerm(e.target.value)} />
                </div>
                {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setFilter(key)}
                        className={`rounded-md border px-3 py-1.5 text-sm ${filter === key ? 'bg-primary text-primary-foreground' : 'bg-white'}`}
                    >
                        {FILTER_LABELS[key]} <span className="opacity-70">{counts[key]}</span>
                    </button>
                ))}
            </div>

            {error && <p className="text-sm text-destructive">Не удалось загрузить: {(error as Error).message}</p>}
            {isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}

            <div className="space-y-2">
                {visible.map(({ hotel, card }) => {
                    const done = card ? Math.round(completeness(card) * 100) : 0;

                    return (
                        <Link
                            key={hotel.id}
                            href={`${routes[PagesEnum.OBJECTS]}/${hotel.id}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3 text-sm hover:bg-muted/30"
                        >
                            <div className="min-w-0">
                                <div className="truncate font-medium">{hotel.title}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                    {[hotel.city, hotel.address].filter(Boolean).join(', ') || 'адрес не указан'}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                                <Badge variant={card?.tariff === 'exclusive' ? 'default' : 'outline'}>
                                    {TARIFF_LABELS[card?.tariff ?? 'basic']}
                                </Badge>
                                <Badge variant="secondary">заполнено {done}%</Badge>
                                {!hotel.user_id && <Badge variant="outline">без отельера</Badge>}
                                {hotel.is_search_visible === false && <Badge variant="outline">скрыт</Badge>}
                                {card?.draft && <Badge variant="destructive">правка на проверке</Badge>}
                            </div>
                        </Link>
                    );
                })}
                {!isPending && visible.length === 0 && <p className="text-sm text-muted-foreground">Ничего не нашлось.</p>}
            </div>
        </div>
    );
};
