import { Badge } from '@/components/ui/badge';
import cx from 'classnames';
import { X } from 'lucide-react';
import React from 'react';
import { FilterOption } from '../lib/types';

interface FilterTagProps {
    /** Опция фильтра */
    option: FilterOption;
    /** Обработчик изменения состояния */
    onToggle: (optionId: string) => void;
    /** Дополнительные CSS классы */
    className?: string;
}

/**
 * Компонент тега фильтра
 * Отображает опцию фильтра с возможностью активации/деактивации
 */
export const FilterTag: React.FC<FilterTagProps> = ({ option, onToggle, className }) => {
    const handleClick = () => {
        onToggle(option.id);
    };

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggle(option.id);
    };

    return (
        <Badge
            variant={option.isActive ? 'default' : 'secondary'}
            className={cx(
                'cursor-pointer transition-all duration-200 hover:scale-105',
                'flex items-center gap-2 px-3 py-1.5',
                option.isActive
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                className,
            )}
            onClick={handleClick}
        >
            <span className="text-sm font-medium">{option.label}</span>
            {option.isActive && (
                <X
                    size={14}
                    className="ml-1 cursor-pointer hover:scale-110 transition-transform"
                    onClick={handleRemove}
                />
            )}
        </Badge>
    );
};
