import { cn } from '@/lib/utils';
import { AlertCircle, FileX, SearchX } from 'lucide-react';
import * as React from 'react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Заголовок */
    title: string;
    /** Описание */
    description?: string;
    /** Иконка */
    icon?: React.ReactNode;
    /** Действия (кнопки) */
    actions?: React.ReactNode;
    /** Размер компонента */
    size?: 'sm' | 'md' | 'lg';
}

/**
 * Компонент пустого состояния для замены ResponsesNothingFound из Consta UI
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
    title,
    description,
    icon,
    actions,
    size = 'md',
    className,
    ...props
}) => {
    const sizeClasses = {
        sm: 'py-8',
        md: 'py-12',
        lg: 'py-16',
    };

    const iconSizes = {
        sm: 'w-12 h-12',
        md: 'w-16 h-16',
        lg: 'w-20 h-20',
    };

    const textSizes = {
        sm: {
            title: 'text-lg',
            description: 'text-sm',
        },
        md: {
            title: 'text-xl',
            description: 'text-base',
        },
        lg: {
            title: 'text-2xl',
            description: 'text-lg',
        },
    };

    // Иконка по умолчанию
    const defaultIcon = <SearchX className={cn(iconSizes[size], 'text-muted-foreground')} />;

    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center text-center space-y-4',
                sizeClasses[size],
                className,
            )}
            {...props}
        >
            <div className="flex items-center justify-center">{icon || defaultIcon}</div>

            <div className="space-y-2">
                <h3 className={cn('font-semibold text-foreground', textSizes[size].title)}>
                    {title}
                </h3>

                {description && (
                    <p
                        className={cn(
                            'text-muted-foreground max-w-md',
                            textSizes[size].description,
                        )}
                    >
                        {description}
                    </p>
                )}
            </div>

            {actions && <div className="flex flex-col sm:flex-row gap-2 mt-6">{actions}</div>}
        </div>
    );
};

// Предустановленные варианты
export const NoResultsFound: React.FC<Omit<EmptyStateProps, 'icon'>> = (props) => (
    <EmptyState icon={<SearchX className="w-16 h-16 text-muted-foreground" />} {...props} />
);

export const NoDataAvailable: React.FC<Omit<EmptyStateProps, 'icon'>> = (props) => (
    <EmptyState icon={<FileX className="w-16 h-16 text-muted-foreground" />} {...props} />
);

export const ErrorState: React.FC<Omit<EmptyStateProps, 'icon'>> = (props) => (
    <EmptyState icon={<AlertCircle className="w-16 h-16 text-red-500" />} {...props} />
);

