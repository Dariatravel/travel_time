'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { isAdminRole } from '@/shared/lib/userRoles';
import { $user } from '@/shared/models/auth';
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import { useUnit } from 'effector-react';
import { ArrowLeft, Download } from 'lucide-react';
import Link from 'next/link';
import React, { useMemo, useState } from 'react';

import {
    useAllAnswers,
    useAllProgress,
    useParticipants,
    useSurveyObjects,
    type AnswerRow,
    type SurveyObject,
} from '../api/survey';
import {
    isNegativeAnswer,
    optionLabel,
    SURVEY_QUESTIONS,
    type SurveyAnswerValue,
    type SurveyQuestion,
} from '../model/questions';

const answerText = (question: SurveyQuestion, value: SurveyAnswerValue): string => {
    if ('choice' in value) return optionLabel(question, value.choice);
    const parts = (value.choices ?? []).map((c) => optionLabel(question, c));
    if (value.other?.trim()) parts.push(`Другое: ${value.other.trim()}`);
    return parts.join('; ');
};

type ObjectStat = {
    object: SurveyObject;
    respondents: Set<string>;
    negativeByQuestion: Record<string, number>;
    answeredByQuestion: Record<string, number>;
    problemIndex: number;
};

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

export const SurveyStatsPage = () => {
    const user = useUnit($user);
    const objectsQuery = useSurveyObjects();
    const answersQuery = useAllAnswers();
    const progressQuery = useAllProgress();
    const participantsQuery = useParticipants();
    const [expanded, setExpanded] = useState<string | null>(null);
    const [city, setCity] = useState('all');
    const [onlyProblems, setOnlyProblems] = useState(true);

    const objects = useMemo(() => objectsQuery.data ?? [], [objectsQuery.data]);
    const answers = useMemo(() => answersQuery.data ?? [], [answersQuery.data]);
    const progress = useMemo(() => progressQuery.data ?? [], [progressQuery.data]);
    const participants = useMemo(() => participantsQuery.data ?? [], [participantsQuery.data]);
    const participantName = useMemo(() => {
        const map = new Map(participants.map((p) => [p.id, p.name]));
        return (id: string) => map.get(id) ?? id.slice(0, 8);
    }, [participants]);

    const stats = useMemo(() => {
        const byObject = new Map<string, AnswerRow[]>();
        for (const row of answers) {
            if (!byObject.has(row.object_slug)) byObject.set(row.object_slug, []);
            byObject.get(row.object_slug)!.push(row);
        }
        const result: ObjectStat[] = objects.map((object) => {
            const rows = byObject.get(object.slug) ?? [];
            const respondents = new Set(rows.map((r) => r.user_id));
            const negativeByQuestion: Record<string, number> = {};
            const answeredByQuestion: Record<string, number> = {};
            let problemIndex = 0;
            for (const question of SURVEY_QUESTIONS) {
                const qRows = rows.filter((r) => r.question_id === question.id);
                answeredByQuestion[question.id] = qRows.length;
                const negative = qRows.filter((r) => isNegativeAnswer(question, r.answer)).length;
                negativeByQuestion[question.id] = negative;
                if (qRows.length) problemIndex += negative / qRows.length;
            }
            return { object, respondents, negativeByQuestion, answeredByQuestion, problemIndex };
        });
        return result.sort(
            (a, b) =>
                b.problemIndex - a.problemIndex ||
                b.respondents.size - a.respondents.size ||
                a.object.title.localeCompare(b.object.title, 'ru'),
        );
    }, [objects, answers]);

    const cities = useMemo(
        () =>
            Array.from(new Set(objects.map((o) => o.city))).sort((a, b) =>
                a.localeCompare(b, 'ru'),
            ),
        [objects],
    );

    const visible = stats.filter(
        (s) => (city === 'all' || s.object.city === city) && (!onlyProblems || s.problemIndex > 0),
    );

    const participation = useMemo(
        () =>
            participants.map((p) => {
                const mine = progress.filter((r) => r.user_id === p.id);
                return {
                    ...p,
                    done: mine.filter((r) => r.status === 'done').length,
                    skipped: mine.filter((r) => r.status === 'skipped').length,
                };
            }),
        [participants, progress],
    );

    const exportCsv = () => {
        const objectBySlug = new Map(objects.map((o) => [o.slug, o]));
        const questionById = new Map(SURVEY_QUESTIONS.map((q) => [q.id, q]));
        const header = [
            'Объект',
            'Тип',
            'Город',
            'Участник',
            'Вопрос',
            'Ответ',
            'Проблемный',
            'Обновлено',
        ];
        const lines = [header.map(csvEscape).join(';')];
        for (const row of answers) {
            const object = objectBySlug.get(row.object_slug);
            const question = questionById.get(row.question_id);
            if (!question) continue;
            lines.push(
                [
                    object?.title ?? row.object_slug,
                    object ? (object.kind === 'hotel' ? 'Отель' : 'Квартира') : '',
                    object?.city ?? '',
                    participantName(row.user_id),
                    question.title,
                    answerText(question, row.answer),
                    isNegativeAnswer(question, row.answer) ? 'да' : 'нет',
                    new Date(row.updated_at).toLocaleString('ru-RU'),
                ]
                    .map(csvEscape)
                    .join(';'),
            );
        }
        const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `opros-obekty-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (!user) return <FullWidthLoader />;
    if (!isAdminRole(user.role)) {
        return <ErrorState title="Статистика доступна только администратору" />;
    }
    if (objectsQuery.isLoading || answersQuery.isLoading || progressQuery.isLoading) {
        return <FullWidthLoader />;
    }
    const loadError = objectsQuery.error || answersQuery.error || progressQuery.error;
    if (loadError) {
        return (
            <ErrorState
                title="Не удалось загрузить данные опроса"
                description={(loadError as Error).message}
            />
        );
    }

    return (
        <div className="mx-auto max-w-6xl space-y-4 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Link href="/main/survey">
                        <Button variant="ghost" size="sm">
                            <ArrowLeft />К опросу
                        </Button>
                    </Link>
                    <h1 className="text-2xl font-semibold">Статистика опроса</h1>
                </div>
                <Button variant="outline" onClick={exportCsv} disabled={answers.length === 0}>
                    <Download />
                    Выгрузить CSV
                </Button>
            </div>

            <section className="rounded-lg border p-3">
                <h2 className="mb-2 font-semibold">Участие</h2>
                <div className="flex flex-wrap gap-2">
                    {participation.map((p) => (
                        <Badge key={p.id} variant="outline">
                            {p.name} ({p.role}): отвечено {p.done}, пропущено {p.skipped} из{' '}
                            {objects.length}
                        </Badge>
                    ))}
                    {participation.length === 0 ? (
                        <span className="text-sm text-muted-foreground">
                            {participantsQuery.error
                                ? (participantsQuery.error as Error).message
                                : 'Участники не загружены'}
                        </span>
                    ) : null}
                </div>
            </section>

            <div className="flex flex-wrap items-center gap-3">
                <select
                    className="h-9 rounded-md border bg-background px-2 text-sm"
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
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={onlyProblems}
                        onChange={(event) => setOnlyProblems(event.target.checked)}
                    />
                    Только с проблемами
                </label>
                <span className="text-sm text-muted-foreground">
                    Объектов: {visible.length} · ответов всего: {answers.length}
                </span>
            </div>

            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left">
                        <tr>
                            <th className="p-2">Объект</th>
                            <th className="p-2">Город</th>
                            <th className="p-2">Ответили</th>
                            <th className="p-2">Индекс проблем</th>
                            {SURVEY_QUESTIONS.map((q) => (
                                <th key={q.id} className="p-2" title={q.title}>
                                    {q.title.slice(0, 22)}…
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((s) => {
                            const open = expanded === s.object.slug;
                            const rows = answers.filter((r) => r.object_slug === s.object.slug);
                            const respondentIds = Array.from(s.respondents);
                            return (
                                <React.Fragment key={s.object.slug}>
                                    <tr
                                        className="cursor-pointer border-t hover:bg-accent"
                                        onClick={() => setExpanded(open ? null : s.object.slug)}
                                    >
                                        <td className="p-2 font-medium">
                                            {s.object.title}
                                            <span className="ml-1 text-xs text-muted-foreground">
                                                {s.object.kind === 'hotel' ? 'отель' : 'кв.'}
                                            </span>
                                        </td>
                                        <td className="p-2">{s.object.city}</td>
                                        <td className="p-2">{s.respondents.size}</td>
                                        <td className="p-2">{s.problemIndex.toFixed(2)}</td>
                                        {SURVEY_QUESTIONS.map((q) => (
                                            <td key={q.id} className="p-2">
                                                {s.answeredByQuestion[q.id]
                                                    ? `${s.negativeByQuestion[q.id]} / ${s.answeredByQuestion[q.id]}`
                                                    : '—'}
                                            </td>
                                        ))}
                                    </tr>
                                    {open ? (
                                        <tr className="border-t bg-muted/30">
                                            <td
                                                className="p-2"
                                                colSpan={4 + SURVEY_QUESTIONS.length}
                                            >
                                                {respondentIds.length === 0 ? (
                                                    <span className="text-muted-foreground">
                                                        Ответов пока нет
                                                    </span>
                                                ) : (
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr>
                                                                <th className="p-1 text-left">
                                                                    Участник
                                                                </th>
                                                                {SURVEY_QUESTIONS.map((q) => (
                                                                    <th
                                                                        key={q.id}
                                                                        className="p-1 text-left"
                                                                    >
                                                                        {q.title}
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {respondentIds.map((uid) => (
                                                                <tr key={uid}>
                                                                    <td className="p-1 font-medium">
                                                                        {participantName(uid)}
                                                                    </td>
                                                                    {SURVEY_QUESTIONS.map((q) => {
                                                                        const row = rows.find(
                                                                            (r) =>
                                                                                r.user_id === uid &&
                                                                                r.question_id ===
                                                                                    q.id,
                                                                        );
                                                                        return (
                                                                            <td
                                                                                key={q.id}
                                                                                className={
                                                                                    row &&
                                                                                    isNegativeAnswer(
                                                                                        q,
                                                                                        row.answer,
                                                                                    )
                                                                                        ? 'p-1 text-red-700'
                                                                                        : 'p-1'
                                                                                }
                                                                            >
                                                                                {row
                                                                                    ? answerText(
                                                                                          q,
                                                                                          row.answer,
                                                                                      )
                                                                                    : '—'}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </td>
                                        </tr>
                                    ) : null}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-muted-foreground">
                «Индекс проблем» — сумма долей проблемных ответов по четырём вопросам (0 — жалоб
                нет, 4 — все участники по всем вопросам отметили проблему). В ячейках вопросов:
                проблемных / ответивших. Нажмите на строку — раскроется, кто как ответил.
            </p>
        </div>
    );
};
