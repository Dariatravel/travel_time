'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isCrmEnabled } from '@/shared/config/featureFlags';
import { $user } from '@/shared/models/auth';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useUnit } from 'effector-react/compat';
import { useState } from 'react';

import { importBatch, importLink, useCrmCounts } from '../api/crm';
import { chunk, importTableForFile, parseJsonl } from '../lib/crm';

const BATCH = 500;

type Progress = { file: string; table: string; total: number; done: number; broken: number; error?: string };

/**
 * Импорт из OKO: файлы clients/deals/messages.jsonl (их готовит
 * oko_prepare_import.py на Mac mini) читаются в браузере и уходят на сервер
 * пачками по 500 строк. Повторный импорт безопасен — строки обновляются по
 * идентификатору OKO.
 */
export const ImportPage = () => {
    const user = useUnit($user);
    const { data: counts, refetch } = useCrmCounts();
    const [progress, setProgress] = useState<Progress[]>([]);
    const [busy, setBusy] = useState(false);

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

    const onFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setBusy(true);
        const list = Array.from(files).sort((a, b) => {
            // Сначала клиенты, потом сделки, потом сообщения — чтобы связка сработала.
            const order = { clients: 0, deals: 1, deal_messages: 2 } as const;

            return (order[importTableForFile(a.name) ?? 'deal_messages'] ?? 9) - (order[importTableForFile(b.name) ?? 'deal_messages'] ?? 9);
        });
        try {
            for (const file of list) {
                const table = importTableForFile(file.name);
                if (!table) {
                    setProgress((p) => [...p, { file: file.name, table: '—', total: 0, done: 0, broken: 0, error: 'Имя файла должно начинаться с clients / deals / messages' }]);
                    continue;
                }
                const text = await file.text();
                const { rows, broken } = parseJsonl(text);
                const item: Progress = { file: file.name, table, total: rows.length, done: 0, broken };
                setProgress((p) => [...p, item]);
                for (const batch of chunk(rows, BATCH)) {
                    await importBatch(table, batch);
                    item.done += batch.length;
                    setProgress((p) => p.map((x) => (x.file === item.file ? { ...item } : x)));
                }
            }
            const link = await importLink();
            showToast(`Импорт завершён. Связано сделок: ${link.deals_linked ?? 0}, сообщений: ${link.messages_linked ?? 0}`, 'success');
            void refetch();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Импорт не удался';
            setProgress((p) => p.map((x, i) => (i === p.length - 1 ? { ...x, error: message } : x)));
            showToast(message, 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-4 px-2 pb-8 sm:px-4">
            <Card className="bg-white/90">
                <CardHeader className="p-4">
                    <CardTitle>Импорт из OKO</CardTitle>
                    <CardDescription>
                        Выберите файлы clients.jsonl, deals.jsonl, messages.jsonl из папки oko-импорт на Mac mini (можно все сразу).
                        Загрузка идёт пачками, повторный импорт не создаёт дублей. В базе сейчас: клиентов {counts?.clients ?? '…'},
                        сделок {counts?.deals ?? '…'}, сообщений {counts?.messages ?? '…'}.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 pt-0">
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
                    {progress.length > 0 && (
                        <ul className="space-y-1 text-sm">
                            {progress.map((p) => (
                                <li key={p.file} className={p.error ? 'text-destructive' : ''}>
                                    {p.file} → {p.table}: {p.done} / {p.total}
                                    {p.broken > 0 ? ` (битых строк: ${p.broken})` : ''}
                                    {p.error ? ` — ${p.error}` : p.done === p.total && p.total > 0 ? ' ✓' : ''}
                                </li>
                            ))}
                        </ul>
                    )}
                    <Button type="button" variant="outline" disabled={busy} onClick={() => importLink().then((r) => showToast(`Связано сделок: ${r.deals_linked ?? 0}, сообщений: ${r.messages_linked ?? 0}`, 'success')).catch((e: unknown) => showToast(e instanceof Error ? e.message : 'Ошибка', 'error'))}>
                        Связать сделки с клиентами и переписками
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};
