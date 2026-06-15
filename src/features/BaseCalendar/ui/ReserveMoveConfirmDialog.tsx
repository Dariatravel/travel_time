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
    guestName?: string;
    roomTitle: string;
    periodLabel: string;
    isLoading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ReserveMoveConfirmDialog = ({
    open,
    guestName,
    roomTitle,
    periodLabel,
    isLoading = false,
    onConfirm,
    onCancel,
}: ReserveMoveConfirmDialogProps) => {
    const guestLabel = guestName?.trim() ? `«${guestName.trim()}»` : 'бронь';

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
                    <AlertDialogTitle>Переместить бронь?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-2 text-sm text-muted-foreground">
                            <p>
                                Переместить {guestLabel} в номер <strong>{roomTitle}</strong>?
                            </p>
                            <p>
                                Период: <strong>{periodLabel}</strong>
                            </p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isLoading}>Отмена</AlertDialogCancel>
                    <AlertDialogAction disabled={isLoading} onClick={onConfirm}>
                        {isLoading ? 'Сохранение...' : 'Переместить'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
