import cn from 'classnames';
import style from './style.module.scss';

interface InsertionIndicatorProps {
    /** Дополнительные классы для стилизации индикатора */
    type?: 'before' | 'after';
}

/**
 * Индикатор вставки для drag-and-drop
 */
export const InsertionIndicator = ({ type = 'after' }: InsertionIndicatorProps) => {
    return (
        <div
            className={cn(style.container, {
                [style.after]: type === 'after',
                [style.before]: type === 'before',
            })}
        />
    );
};
