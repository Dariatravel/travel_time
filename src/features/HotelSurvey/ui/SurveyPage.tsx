'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { isStaffRole } from '@/shared/lib/userRoles';
import { $user } from '@/shared/models/auth';
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import { useUnit } from 'effector-react';
import { ArrowLeft, ArrowRight, Check, ExternalLink, List, SkipForward } from 'lucide-react';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
    useMyAnswers,
    useMyProgress,
    useSaveAnswer,
    useSetProgress,
    useSurveyObjects,
    type AnswerRow,
    type ProgressRow,
    type SurveyObject,
} from '../api/survey';
import { SURVEY_QUESTIONS, type SurveyAnswerValue, type SurveyQuestion } from '../model/questions';

const LAST_OBJECT_KEY = 'hotel-survey:last-object';

type StatusFilter = 'all' | 'todo' | 'done' | 'skipped';
type KindFilter = 'all' | 'hotel' | 'kvartira';

const kindLabel = (kind: SurveyObject['kind']) => (kind === 'hotel' ? 'Отель' : 'Квартира');

const readLastObject = () => {
    try {
        return window.localStorage.getItem(LAST_OBJECT_KEY);
    } catch {
        return null;
    }
};

const writeLastObject = (slug: string | null) => {
    try {
        if (slug) window.localStorage.setItem(LAST_OBJECT_KEY, slug);
        else window.localStorage.removeItem(LAST_OBJECT_KEY);
    } catch {
        // приватный режим — не страшно, прогресс и так в базе
    }
};

// ---------- карточка одного вопроса ----------

type QuestionCardProps = {
    question: SurveyQuestion;
    value: SurveyAnswerValue | undefined;
    onChange: (value: SurveyAnswerValue | null) => void;
};

const QuestionCard = ({ question, value, onChange }: QuestionCardProps) => {
    const choices = value && 'choices' in value ? value.choices : [];
    const other = value && 'choices' in value ? (value.other ?? '') : '';
    const choice = value && 'choice' in value ? value.choice : null;
    const [otherDraft, setOtherDraft] = useState(other);

    useEffect(() => {
        setOtherDraft(other);
    }, [other]);

    const toggleSingle = (optionId: string) => {
        onChange(choice === optionId ? null : { choice: optionId });
    };

    const commitMulti = (nextChoices: string[], nextOther: string) => {
        const trimmed = nextOther.trim();
        if (nextChoices.length === 0 && !trimmed) {
            onChange(null);
            return;
        }
        onChange({ choices: nextChoices, ...(trimmed ? { other: trimmed } : {}) });
    };

    const toggleMulti = (optionId: string) => {
        const next = choices.includes(optionId)
            ? choices.filter((c) => c !== optionId)
            : [...choices, optionId];
        commitMulti(next, otherDraft);
    };

    return (
        <div className="space-y-2">
            <p className="font-medium">{question.title}</p>
            <div className="flex flex-wrap gap-2">
                {question.options.map((option) => {
                    const active =
                        question.type === 'single'
                            ? choice === option.id
                            : choices.includes(option.id);
                    return (
                        <Button
                            key={option.id}
                            type="button"
                            size="sm"
                            variant={active ? 'default' : 'outline'}
                            onClick={() =>
                                question.type === 'single'
                                    ? toggleSingle(option.id)
                                    : toggleMulti(option.id)
                            }
                        >
                            {active ? <Check /> : null}
                            {option.label}
                        </Button>
                    );
                })}
            </div>
            {question.type === 'multi' && question.allowOther ? (
                <Input
                    value={otherDraft}
                    placeholder="Другое — впишите свой вариант"
                    onChange={(event) => setOtherDraft(event.target.value)}
                    onBlur={() => {
                        if (otherDraft.trim() !== other.trim()) commitMulti(choices, otherDraft);
                    }}
                />
            ) : null}
        </div>
    );
};

// ---------- страница ----------

export const SurveyPage = () => {
    const user = useUnit($user);
    const objectsQuery = useSurveyObjects();
    const answersQuery = useMyAnswers();
    const progressQuery = useMyProgress();
    const saveAnswer = useSaveAnswer();
    const setProgress = useSetProgress();

    const [currentSlug, setCurrentSlug] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [city, setCity] = useState('all');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [kind, setKind] = useState<KindFilter>('all');

    const objects = useMemo(() => objectsQuery.data ?? [], [objectsQuery.data]);
    const answersByObject = useMemo(() => {
        const map = new Map<string, Map<string, AnswerRow>>();
        for (const row of answersQuery.data ?? []) {
            if (!map.has(row.object_slug)) map.set(row.object_slug, new Map());
            map.get(row.object_slug)!.set(row.question_id, row);
        }
        return map;
    }, [answersQuery.data]);
    const progressByObject = useMemo(() => {
        const map = new Map<string, ProgressRow>();
        for (const row of progressQuery.data ?? []) map.set(row.object_slug, row);
        return map;
    }, [progressQuery.data]);

    const cities = useMemo(
        () =>
            Array.from(new Set(objects.map((o) => o.city))).sort((a, b) =>
                a.localeCompare(b, 'ru'),
            ),
        [objects],
    );

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return objects.filter((o) => {
            if (kind !== 'all' && o.kind !== kind) return false;
            if (city !== 'all' && o.city !== city) return false;
            const st = progressByObject.get(o.slug)?.status;
            if (status === 'todo' && st) return false;
            if (status === 'done' && st !== 'done') return false;
            if (status === 'skipped' && st !== 'skipped') return false;
            if (needle && !`${o.title} ${o.city}`.toLowerCase().includes(needle)) return false;
            return true;
        });
    }, [objects, kind, city, status, search, progressByObject]);

    const visitedCount = progressByObject.size;
    const doneCount = Array.from(progressByObject.values()).filter(
        (p) => p.status === 'done',
    ).length;
    const firstUnvisited = objects.find((o) => !progressByObject.has(o.slug)) ?? null;

    // Восстанавливаем объект, на котором остановились в этом браузере.
    useEffect(() => {
        if (currentSlug || objects.length === 0) return;
        const last = readLastObject();
        if (last && objects.some((o) => o.slug === last)) setCurrentSlug(last);
    }, [objects, currentSlug]);

    const openObject = useCallback((slug: string | null) => {
        setCurrentSlug(slug);
        writeLastObject(slug);
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    }, []);

    const current = currentSlug ? (objects.find((o) => o.slug === currentSlug) ?? null) : null;
    const navList = filtered.length > 0 ? filtered : objects;
    const currentIndex = current ? navList.findIndex((o) => o.slug === current.slug) : -1;
    const prevObject = currentIndex > 0 ? navList[currentIndex - 1] : null;
    const nextObject =
        currentIndex >= 0 && currentIndex < navList.length - 1 ? navList[currentIndex + 1] : null;

    const finishObject = async (obj: SurveyObject, forcedStatus?: 'skipped') => {
        const hasAnswers = (answersByObject.get(obj.slug)?.size ?? 0) > 0;
        const nextStatus: 'done' | 'skipped' = forcedStatus ?? (hasAnswers ? 'done' : 'skipped');
        await setProgress.mutateAsync({ objectSlug: obj.slug, status: nextStatus });
        openObject(nextObject?.slug ?? null);
    };

    if (!user) return <FullWidthLoader />;
    if (!isStaffRole(user.role)) {
        return (
            <ErrorState
                title="Опрос доступен только сотрудникам"
                description="Войдите под учётной записью администратора или оператора."
            />
        );
    }
    if (objectsQuery.isLoading || answersQuery.isLoading || progressQuery.isLoading) {
        return <FullWidthLoader />;
    }
    if (objectsQuery.isError) {
        return (
            <ErrorState
                title="Не удалось загрузить список объектов с сайта"
                description={(objectsQuery.error as Error)?.message}
                actions={<Button onClick={() => objectsQuery.refetch()}>Попробовать снова</Button>}
            />
        );
    }

    const saving = saveAnswer.isPending || setProgress.isPending;
    const saveError = saveAnswer.error || setProgress.error;

    const progressBar = (
        <div className="space-y-1">
            <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                    Пройдено {visitedCount} из {objects.length} (с ответами: {doneCount})
                </span>
                <span>
                    {saving ? 'Сохраняю…' : saveError ? 'Ошибка сохранения' : 'Сохранено ✓'}
                </span>
            </div>
            <div className="h-2 w-full rounded bg-muted">
                <div
                    className="h-2 rounded bg-primary transition-all"
                    style={{
                        width: `${objects.length ? (visitedCount / objects.length) * 100 : 0}%`,
                    }}
                />
            </div>
            {saveError ? (
                <p className="text-sm text-red-600">
                    {(saveError as Error).message}. Проверьте интернет и нажмите ответ ещё раз.
                </p>
            ) : null}
        </div>
    );

    // ---- вид: один объект ----
    if (current) {
        const myAnswers = answersByObject.get(current.slug);
        const st = progressByObject.get(current.slug)?.status;
        return (
            <div className="mx-auto max-w-3xl space-y-4 p-2">
                {progressBar}
                <div className="flex items-center justify-between gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openObject(null)}>
                        <List />К списку
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        {currentIndex + 1} из {navList.length}
                    </span>
                </div>
                <Card>
                    <CardContent className="space-y-4 p-4">
                        <div className="flex flex-wrap items-start gap-4">
                            {current.coverUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={current.coverUrl}
                                    alt={current.title}
                                    className="h-28 w-40 flex-none rounded object-cover"
                                    loading="lazy"
                                />
                            ) : null}
                            <div className="min-w-0 flex-1 space-y-1">
                                <h1 className="text-xl font-semibold">{current.title}</h1>
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                    <Badge variant="secondary">{kindLabel(current.kind)}</Badge>
                                    <Badge variant="outline">{current.city}</Badge>
                                    {st ? (
                                        <Badge variant={st === 'done' ? 'default' : 'outline'}>
                                            {st === 'done' ? 'отвечено' : 'пропущен'}
                                        </Badge>
                                    ) : null}
                                </div>
                                {current.location ? (
                                    <p className="text-sm text-muted-foreground">
                                        {current.location}
                                    </p>
                                ) : null}
                                <a
                                    href={current.pageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-sm text-primary underline"
                                >
                                    <ExternalLink className="size-4" />
                                    Открыть на сайте
                                </a>
                            </div>
                        </div>

                        <div className="space-y-5 border-t pt-4">
                            {SURVEY_QUESTIONS.map((question) => (
                                <QuestionCard
                                    key={question.id}
                                    question={question}
                                    value={myAnswers?.get(question.id)?.answer}
                                    onChange={(value) =>
                                        saveAnswer.mutate({
                                            objectSlug: current.slug,
                                            questionId: question.id,
                                            value,
                                        })
                                    }
                                />
                            ))}
                            <p className="text-xs text-muted-foreground">
                                Отвечать на все вопросы не обязательно — можно перейти к следующему
                                объекту. Каждый ответ сохраняется сразу.
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                        variant="outline"
                        disabled={!prevObject}
                        onClick={() => prevObject && openObject(prevObject.slug)}
                    >
                        <ArrowLeft />
                        Назад
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            disabled={saving}
                            onClick={() => finishObject(current, 'skipped')}
                        >
                            <SkipForward />
                            Пропустить объект
                        </Button>
                        <Button disabled={saving} onClick={() => finishObject(current)}>
                            Дальше
                            <ArrowRight />
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // ---- вид: список ----
    const selectClass = 'h-9 rounded-md border bg-background px-2 text-sm';
    return (
        <div className="mx-auto max-w-5xl space-y-4 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-2xl font-semibold">Опрос по объектам сайта</h1>
                {user.role === 'admin' ? (
                    <Link href="/main/survey/stats" className="text-sm text-primary underline">
                        Статистика
                    </Link>
                ) : null}
            </div>
            {progressBar}
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    disabled={!firstUnvisited}
                    onClick={() => firstUnvisited && openObject(firstUnvisited.slug)}
                >
                    {visitedCount === 0 ? 'Начать' : 'Продолжить'}
                    <ArrowRight />
                </Button>
                <Input
                    className="max-w-xs"
                    placeholder="Поиск по названию"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                <select
                    className={selectClass}
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                >
                    <option value="all">Все города</option>
                    {cities.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>
                <select
                    className={selectClass}
                    value={kind}
                    onChange={(event) => setKind(event.target.value as KindFilter)}
                >
                    <option value="all">Отели и квартиры</option>
                    <option value="hotel">Только отели</option>
                    <option value="kvartira">Только квартиры</option>
                </select>
                <select
                    className={selectClass}
                    value={status}
                    onChange={(event) => setStatus(event.target.value as StatusFilter)}
                >
                    <option value="all">Все</option>
                    <option value="todo">Осталось</option>
                    <option value="done">Отвечено</option>
                    <option value="skipped">Пропущено</option>
                </select>
                <span className="text-sm text-muted-foreground">Показано: {filtered.length}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((o) => {
                    const st = progressByObject.get(o.slug)?.status;
                    return (
                        <button
                            key={o.slug}
                            type="button"
                            onClick={() => openObject(o.slug)}
                            className="flex items-center gap-3 rounded-lg border bg-card p-2 text-left transition hover:bg-accent"
                        >
                            {o.coverUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={o.coverUrl}
                                    alt=""
                                    className="h-14 w-20 flex-none rounded object-cover"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="h-14 w-20 flex-none rounded bg-muted" />
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{o.title}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {kindLabel(o.kind)} · {o.city}
                                </p>
                            </div>
                            {st === 'done' ? (
                                <Check className="size-5 flex-none text-green-600" />
                            ) : st === 'skipped' ? (
                                <SkipForward className="size-5 flex-none text-muted-foreground" />
                            ) : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
