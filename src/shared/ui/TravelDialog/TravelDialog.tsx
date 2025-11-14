import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { FC, ReactNode } from 'react';

export interface TravelDialogProps {
    isOpen: boolean;
    onClose: () => void;
    /** Заголовок модального окна */
    title?: ReactNode;
    /** Основное содержимое (будет обёрнуто в DialogDescription) */
    description?: ReactNode;
    /** Футер с кнопками действий */
    footer?: ReactNode;
    /** Дополнительные дети (если не используются title/description/footer) */
    children?: ReactNode;
    className?: string;
    contentClassName?: string;
    /** Дополнительные классы для DialogHeader */
    headerClassName?: string;
    /** Дополнительные классы для DialogDescription */
    descriptionClassName?: string;
    /** Дополнительные классы для DialogFooter */
    footerClassName?: string;
}

export const TravelDialog: FC<TravelDialogProps> = ({
    isOpen,
    onClose,
    title,
    description,
    footer,
    children,
    className,
    contentClassName,
    headerClassName,
    descriptionClassName,
    footerClassName,
}) => {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className={cn(
                    // Базовые стили для мобильных (full-screen)
                    'top-0 translate-y-2 max-h-[calc(100svh-2rem)] max-h-[calc(100dvh-2rem)] min-w-[calc(100vw-2rem)] overflow-y-auto flex-col p-1',
                    // Стили для десктопа
                    'sm:top-[50%] sm:translate-y-[-50%] sm:h-auto sm:max-h-[90vh] sm:w-auto sm:max-w-2xl sm:min-w-auto sm:rounded-xl sm:p-4',
                    className,
                    contentClassName,
                )}
            >
                {/* Если используется новый API с title/description/footer */}
                {(title || description || footer) && (
                    <>
                        {title && (
                            <DialogHeader
                                className={cn(
                                    'shrink-0 px-4 pt-4 sm:px-0 sm:pt-0',
                                    headerClassName,
                                )}
                            >
                                <DialogTitle>{title}</DialogTitle>
                            </DialogHeader>
                        )}

                        {description && (
                            <DialogDescription
                                className={cn(
                                    'flex-1 overflow-y-auto px-1 sm:px-1',
                                    descriptionClassName,
                                )}
                            >
                                {description}
                            </DialogDescription>
                        )}

                        {footer && (
                            <DialogFooter
                                className={cn(
                                    'flex shrink-0 flex-col gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:justify-end sm:border-none sm:px-0 sm:py-0 sm:pt-4',
                                    footerClassName,
                                )}
                            >
                                {footer}
                            </DialogFooter>
                        )}
                    </>
                )}

                {/* Старый API с children (для обратной совместимости) */}
                {!title && !description && !footer && children}
            </DialogContent>
        </Dialog>
    );
};
