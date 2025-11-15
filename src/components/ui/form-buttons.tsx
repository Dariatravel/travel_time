import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import * as React from 'react';

export interface FormButtonsProps {
    className?: string;
    isLoading?: boolean;
    onAccept?: () => void;
    onClose?: () => void;
    isEdit?: boolean;
    onDelete?: () => void;
    deleteText?: string;
}

export const FormButtons = React.forwardRef<HTMLDivElement, FormButtonsProps>(
    (
        {
            className,
            isLoading = false,
            onAccept,
            onClose,
            isEdit = false,
            onDelete,
            deleteText = 'Удалить',
        },
        ref,
    ) => {
        return (
            <div ref={ref} className={cn('flex justify-end gap-3 mt-6', className)}>
                {isEdit && onDelete && (
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={onDelete}
                        disabled={isLoading}
                    >
                        {deleteText}
                    </Button>
                )}

                <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                    Отмена
                </Button>

                <Button type="submit" onClick={onAccept} disabled={isLoading}>
                    {isLoading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
                </Button>
            </div>
        );
    },
);

FormButtons.displayName = 'FormButtons';


