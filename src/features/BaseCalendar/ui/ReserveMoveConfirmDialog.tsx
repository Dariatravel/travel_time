'use client';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ReserveMoveConfirmDialogProps {
    open: boolean;
    title?: string;
    guestName?: string;
    roomTitle: string;
    periodLabel: string;
    conflictLabels?: string[];
    isLoading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ReserveMoveConfirmDialog = ({
    open,
    title = 'Переместить бронь?',
    guestName,
    roomTitle,
    periodLabel,
    conflictLabels = [],
    isLoading = false,
    onConfirm,
    onCancel,
}: ReserveMoveConfirmDialogProps) => {
    const guestLabel = guestName?.trim() ? `«${guestName.trim()}»` : 'бронь';
    const hasConflicts = conflictLabels.length > 0;

    return (
        <AlertDialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    onCancel();
                }
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-2 text-sm text-muted-foreground">
                            <p>
                                Переместить {guestLabel} в номер <strong>{roomTitle}</strong>?
                            </p>
                            <p>
                                Период: <strong>{periodLabel}</strong>
                            </p>
                            {hasConflicts && (
                                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                                    <p className="font-medium">
                                        В этом номере уже есть бронь на эти даты:
                                    </p>
                                    <ul className="mt-2 list-disc space-y-1 pl-5">
                                        {conflictLabels.map((label) => (
                                            <li key={label}>{label}</li>
                                        ))}
                                    </ul>
                                    <p className="mt-2">
                                        Подтвердите только если хотите временно наложить брони и
                                        затем вручную переставить вторую бронь.
                                    </p>
                                </div>
                            )}
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isLoading}>Отмена</AlertDialogCancel>
                    <AlertDialogAction disabled={isLoading} onClick={onConfirm}>
                        {isLoading
                            ? 'Сохранение...'
                            : hasConflicts
                              ? 'Переместить с пересечением'
                              : 'Переместить'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
