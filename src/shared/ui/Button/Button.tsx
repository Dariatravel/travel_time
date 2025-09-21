import { Button, ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import React, { CSSProperties, FC } from 'react';

/**
 * Интерфейс пропсов для компонента TravelButton
 */
export interface TravelButtonProps extends Omit<ButtonProps, 'children'> {
    /** Дополнительные стили для кнопки */
    style?: CSSProperties;
    /** Текст кнопки (для совместимости с Consta UI) */
    label?: string;
    /** Содержимое кнопки */
    children?: React.ReactNode;
    /** Обработчик клика */
    onClick?: () => void;
}

/**
 * Кастомный компонент кнопки на базе Shadcn Button с совместимостью с Consta UI API
 */
export const TravelButton: FC<TravelButtonProps> = ({
    style,
    label,
    children,
    className,
    ...props
}) => {
    return (
        <Button
            style={{ minWidth: '166px', ...style }}
            className={cn('min-w-[166px]', className)}
            {...props}
        >
            {label || children}
        </Button>
    );
};
