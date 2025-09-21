import cn from 'classnames';
import { Loader2 } from 'lucide-react';
import { CSSProperties, FC } from 'react';
import cx from './style.module.scss';

export interface LoaderProps {
    /** Дополнительные стили */
    style?: CSSProperties;
    /** CSS класс */
    className?: string;
    /** Размер лоадера */
    size?: 'xs' | 's' | 'm' | 'l' | 'xl';
    /** Цвет лоадера */
    color?: string;
}

/**
 * Компонент загрузчика на основе lucide-react Loader2
 */
export const Loader: FC<LoaderProps> = ({
    style,
    className,
    size = 'm',
    color = 'currentColor',
    ...props
}) => {
    const sizeMap = {
        xs: 12,
        s: 16,
        m: 24,
        l: 32,
        xl: 48,
    };

    return (
        <Loader2
            className={cn('animate-spin', cx.loader, className)}
            style={{ color, ...style }}
            size={sizeMap[size]}
            {...props}
        />
    );
};

/**
 * Полноширинный лоадер для страниц и модальных окон
 */
export const FullWidthLoader: FC<LoaderProps> = ({ style, className, size = 'l', ...props }) => {
    return (
        <div
            className={cn(
                cx.container,
                'flex items-center justify-center min-h-[200px]',
                className,
            )}
        >
            <Loader size={size} {...props} />
        </div>
    );
};
