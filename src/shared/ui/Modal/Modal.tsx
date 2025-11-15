import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import cn from 'classnames';
import { X } from 'lucide-react';
import { CSSProperties, FC, ReactNode } from 'react';
import st from './style.module.scss';

export interface ModalProps {
    /** Открыто ли модальное окно */
    isOpen?: boolean;
    /** Обработчик закрытия */
    onClose?: () => void;
    /** Заголовок модального окна */
    title?: string;
    /** Содержимое модального окна */
    children?: ReactNode;
    /** Дополнительные стили */
    style?: CSSProperties;
    /** Состояние загрузки */
    loading?: boolean;
    /** Дополнительный CSS класс */
    className?: string;
    /** Размер модального окна */
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

/**
 * Компонент модального окна на базе Shadcn Dialog с совместимостью с Consta UI API
 */
export const Modal: FC<ModalProps> = ({
    children,
    loading = false,
    isOpen = false,
    onClose,
    title,
    className,
    style,
    size = 'md',
    ...props
}) => {
    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        full: 'max-w-full h-full',
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
            <DialogContent
                className={cn(sizeClasses[size], 'max-h-[90vh] overflow-y-auto', className)}
                style={style}
            >
                {title && (
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                    </DialogHeader>
                )}

                {/* Кнопка закрытия для совместимости */}
                {onClose && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-4 top-4 h-6 w-6 p-0 opacity-70 hover:opacity-100"
                        onClick={onClose}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}

                {loading && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-50">
                        <FullWidthLoader className={st.loader} />
                    </div>
                )}

                <div className={cn(loading && 'opacity-50 pointer-events-none')}>{children}</div>
            </DialogContent>
        </Dialog>
    );
};
