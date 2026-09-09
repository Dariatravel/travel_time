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
import { ArrowLeft, ArrowRight, Check, ExternalLink, Play, SkipForward } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';

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

const kindLabel = (kind: SurveyObject['kind']) => (kind === 'hotel' ? 'Отель' : 'Квартира');

// Кнопки ответов: обычный шрифт, перенос текста, сетка — на телефоне две
// колонки, на компьютере все варианты в одну строку. Итого не больше двух строк.
const OPTIONS_GRID = 'grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4';
const OPTION_BUTTON = 'h-auto min-h-9 w-full whitespace-normal px-3 py-2 text-sm font-normal';

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
            <p className="text-base font-bold">{question.title}</p>
            <div className={OPTIONS_GRID}>
                {question.options.map((option) => {
                    const active =
                        question.type === 'single'
                            ? choice === option.id
                            : choices.includes(option.id);
                    return (
                        <Button
                            key={option.id}
                            type="button"
                            variant={active ? 'default' : 'outline'}
                            className={OPTION_BUTTON}
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

    // Объект, открытый в этой сессии вручную («Назад», «Старт»). Если null —
    // показываем место остановки: первый объект без отметки о прохождении.
    const [currentSlug, setCurrentSlug] = useState<string | null>(null);
    const [started, setStarted] = useState(false);

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

    const visitedCount = objects.filter((o) => progressByObject.has(o.slug)).length;
    const doneCount = objects.filter((o) => progressByObject.get(o.slug)?.status === 'done').length;
    const resumeObject = objects.find((o) => !progressByObject.has(o.slug)) ?? null;

    const openObject = (slug: string | null) => {
        setCurrentSlug(slug);
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
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
    const statsLink =
        user.role === 'admin' ? (
            <Link href="/main/survey/stats" className="text-sm text-primary underline">
                Статистика
            </Link>
        ) : null;

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

    // ---- стартовый экран: только пока ни одного объекта не пройдено ----
    if (visitedCount === 0 && !started && !currentSlug) {
        return (
            <div className="mx-auto max-w-3xl space-y-4 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-2xl font-semibold">Опрос по объектам сайта</h1>
                    {statsLink}
                </div>
                <Card>
                    <CardContent className="space-y-4 p-4">
                        <p>
                            Объектов: <b>{objects.length}</b> — отели и квартиры с сайта
                            абхазберег.рф. Они будут открываться по одному, по 4 вопроса с кнопками
                            на каждый.
                        </p>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                            <li>
                                Отвечать на все вопросы не обязательно — «Дальше» переводит к
                                следующему.
                            </li>
                            <li>Если с объектом не работали — «Пропустить объект».</li>
                            <li>
                                Каждый ответ сохраняется сразу. Можно закрыть страницу и вернуться
                                позже — опрос продолжится с того места, где остановились.
                            </li>
                        </ul>
                        <Button
                            size="lg"
                            onClick={() => {
                                setStarted(true);
                                openObject(objects[0]?.slug ?? null);
                            }}
                            disabled={objects.length === 0}
                        >
                            <Play />
                            Старт
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const current =
        (currentSlug ? objects.find((o) => o.slug === currentSlug) : null) ?? resumeObject;

    // ---- финальный экран: все объекты пройдены ----
    if (!current) {
        const lastObject = objects[objects.length - 1] ?? null;
        return (
            <div className="mx-auto max-w-3xl space-y-4 p-2">
                {progressBar}
                <Card>
                    <CardContent className="space-y-4 p-4">
                        <h1 className="text-2xl font-semibold">Готово — все объекты пройдены 🎉</h1>
                        <p className="text-muted-foreground">
                            Спасибо! Ответы сохранены. Если хотите что-то поправить — вернитесь к
                            предыдущим объектам кнопкой «Назад».
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                disabled={!lastObject}
                                onClick={() => lastObject && openObject(lastObject.slug)}
                            >
                                <ArrowLeft />
                                Назад
                            </Button>
                            {statsLink}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ---- один объект ----
    const currentIndex = objects.findIndex((o) => o.slug === current.slug);
    const prevObject = currentIndex > 0 ? objects[currentIndex - 1] : null;
    const nextObject = currentIndex < objects.length - 1 ? objects[currentIndex + 1] : null;
    const myAnswers = answersByObject.get(current.slug);
    const st = progressByObject.get(current.slug)?.status;

    const finishObject = async (forcedStatus?: 'skipped') => {
        const hasAnswers = (myAnswers?.size ?? 0) > 0;
        const nextStatus: 'done' | 'skipped' = forcedStatus ?? (hasAnswers ? 'done' : 'skipped');
        await setProgress.mutateAsync({ objectSlug: current.slug, status: nextStatus });
        // null → следующий непройденный; но при последовательном проходе это
        // как раз следующий объект, а «Назад» всегда доступен.
        openObject(nextObject?.slug ?? null);
    };

    return (
        <div className="mx-auto max-w-3xl space-y-4 p-2">
            {progressBar}
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                    Объект {currentIndex + 1} из {objects.length}
                </span>
                {statsLink}
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
                                <p className="text-sm text-muted-foreground">{current.location}</p>
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
                        onClick={() => finishObject('skipped')}
                    >
                        <SkipForward />
                        Пропустить объект
                    </Button>
                    <Button disabled={saving} onClick={() => finishObject()}>
                        Дальше
                        <ArrowRight />
                    </Button>
                </div>
            </div>
        </div>
    );
};
