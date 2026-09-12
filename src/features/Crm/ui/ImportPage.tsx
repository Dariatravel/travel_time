'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isCrmEnabled } from '@/shared/config/featureFlags';
import { $user } from '@/shared/models/auth';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useUnit } from 'effector-react/compat';
import { useRef, useState } from 'react';

import { importBatch, useCrmCounts } from '../api/crm';
import { importTableForFile } from '../lib/crm';

const BATCH = 500;
// Клиенты → сделки → сообщения → связи переписок (связи last: им нужны клиенты).
const ORDER = { clients: 0, deals: 1, deal_messages: 2, client_links: 3 } as const;

type Progress = {
    id: number;
    file: string;
    table: string;
    sent: number;
    written: number;
    skipped: number;
    broken: number;
    done: boolean;
    error?: string;
};

/**
 * Читает JSONL-файл потоком, по строкам, и отдаёт пачки — файл переписок
 * весит ~100 МБ, целиком в памяти вкладки его держать нельзя.
 */
async function* readJsonlBatches(file: File, size: number, onBroken: () => void) {
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    let tail = '';
    let batch: Record<string, unknown>[] = [];
    const push = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
            const value = JSON.parse(trimmed);
            if (value && typeof value === 'object' && !Array.isArray(value)) batch.push(value as Record<string, unknown>);
            else onBroken();
        } catch {
            onBroken();
        }
    };
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const parts = (tail + value).split('\n');
        tail = parts.pop() ?? '';
        for (const line of parts) {
            push(line);
            if (batch.length >= size) {
                yield batch;
                batch = [];
            }
        }
    }
    push(tail);
    if (batch.length > 0) yield batch;
}

/**
 * Импорт из OKO: файлы clients/deals/messages.jsonl (их готовит
 * oko_prepare_import.py на Mac mini) читаются в браузере потоком и уходят
 * на сервер пачками по 500 строк. Повторный импорт безопасен: строки
 * обновляются по идентификатору OKO, а сделки, которые уже правили в
 * шахматке, не трогаются.
 */
export const ImportPage = () => {
    const user = useUnit($user);
    const { data: counts, refetch } = useCrmCounts();
    const [progress, setProgress] = useState<Progress[]>([]);
    const [busy, setBusy] = useState(false);
    const stopRef = useRef(false);

    if (!isCrmEnabled(user?.role)) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Импорт из OKO</CardTitle>
                    <CardDescription>Раздел пока открыт только администратору.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const update = (id: number, patch: Partial<Progress>) =>
        setProgress((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));

    const onFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const list = Array.from(files).sort(
            (a, b) => (ORDER[importTableForFile(a.name) ?? 'deal_messages'] ?? 9) - (ORDER[importTableForFile(b.name) ?? 'deal_messages'] ?? 9),
        );
        const summary = list.map((f) => `${f.name} (${Math.round(f.size / 1024 / 1024)} МБ)`).join(', ');
        if (!window.confirm(`Загрузить в базу: ${summary}? Сделки, которые уже правили в шахматке, не изменятся.`)) return;

        setBusy(true);
        stopRef.current = false;
        try {
            for (const file of list) {
                const id = Date.now() + Math.random();
                const table = importTableForFile(file.name);
                const item: Progress = { id, file: file.name, table: table ?? '—', sent: 0, written: 0, skipped: 0, broken: 0, done: false };
                setProgress((p) => [...p, item]);
                if (!table) {
                    update(id, { error: 'Имя файла должно начинаться с clients / deals / messages', done: true });
                    continue;
                }
                try {
                    for await (const batch of readJsonlBatches(file, BATCH, () => {
                        item.broken += 1;
                    })) {
                        if (stopRef.current) throw new Error('Остановлено');
                        const result = await importBatch(table, batch);
                        item.sent += batch.length;
                        item.written += result.written;
                        item.skipped += result.skipped;
                        update(id, { sent: item.sent, written: item.written, skipped: item.skipped, broken: item.broken });
                    }
                    update(id, { done: true, broken: item.broken });
                } catch (error) {
                    update(id, { error: error instanceof Error ? error.message : 'Импорт не удался', done: true });
                    throw error;
                }
            }
            showToast('Импорт завершён', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Импорт не удался', 'error');
        } finally {
            setBusy(false);
            void refetch();
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-4 px-2 pb-8 sm:px-4">
            <Card className="bg-white/90">
                <CardHeader className="p-4">
                    <CardTitle>Импорт из OKO</CardTitle>
                    <CardDescription>
                        Выберите файлы clients.jsonl, deals.jsonl, messages.jsonl из папки oko-импорт на Mac mini (можно все сразу —
                        порядок выставится сам). Загрузка идёт пачками; повторный импорт не создаёт дублей и не трогает сделки,
                        которые уже правили здесь. В базе сейчас: клиентов {counts?.clients ?? '…'}, сделок {counts?.deals ?? '…'},
                        сообщений {counts?.messages ?? '…'}.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 pt-0">
                    <div className="flex flex-wrap items-center gap-3">
                        <input
                            type="file"
                            accept=".jsonl,.json,.txt"
                            multiple
                            disabled={busy}
                            onChange={(e) => {
                                void onFiles(e.target.files);
                                e.target.value = '';
                            }}
                        />
                        {busy && (
                            <Button type="button" size="sm" variant="outline" onClick={() => (stopRef.current = true)}>
                                Остановить
                            </Button>
                        )}
                    </div>
                    {progress.length > 0 && (
                        <ul className="space-y-1 text-sm">
                            {progress.map((p) => (
                                <li key={p.id} className={p.error ? 'text-destructive' : ''}>
                                    {p.file} → {p.table}: отправлено {p.sent}, записано {p.written}
                                    {p.skipped > 0 ? `, пропущено ${p.skipped}` : ''}
                                    {p.broken > 0 ? `, битых строк ${p.broken}` : ''}
                                    {p.error ? ` — ${p.error}` : p.done ? ' ✓' : ' …'}
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Если загрузка оборвалась — просто выберите тот же файл ещё раз: уже загруженные строки обновятся без дублей.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
};
