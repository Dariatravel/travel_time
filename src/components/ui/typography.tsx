import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const typographyVariants = cva('', {
    variants: {
        variant: {
            h1: 'scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl',
            h2: 'scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0',
            h3: 'scroll-m-20 text-2xl font-semibold tracking-tight',
            h4: 'scroll-m-20 text-xl font-semibold tracking-tight',
            h5: 'scroll-m-20 text-lg font-semibold tracking-tight',
            h6: 'scroll-m-20 text-base font-semibold tracking-tight',
            p: 'leading-7 [&:not(:first-child)]:mt-6',
            blockquote: 'mt-6 border-l-2 pl-6 italic',
            list: 'my-6 ml-6 list-disc [&>li]:mt-2',
            'inline-code':
                'relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-medium',
            lead: 'text-xl text-muted-foreground',
            large: 'text-lg font-semibold',
            small: 'text-sm font-medium leading-none',
            muted: 'text-sm text-muted-foreground',
            body: 'text-base leading-relaxed',
            caption: 'text-xs text-muted-foreground',
        },
        align: {
            left: 'text-left',
            center: 'text-center',
            right: 'text-right',
        },
        weight: {
            light: 'font-light',
            normal: 'font-normal',
            medium: 'font-medium',
            semibold: 'font-semibold',
            bold: 'font-bold',
            extrabold: 'font-extrabold',
        },
    },
    defaultVariants: {
        variant: 'body',
        align: 'left',
        weight: 'normal',
    },
});

export interface TypographyProps
    extends React.HTMLAttributes<HTMLElement>,
        VariantProps<typeof typographyVariants> {
    /** Элемент для рендера (по умолчанию определяется по variant) */
    as?: keyof JSX.IntrinsicElements;
    /** Размер текста (для совместимости с Consta UI) */
    size?: 'xs' | 's' | 'm' | 'l' | 'xl' | '2xl' | '3xl' | '4xl';
    /** Вид текста (для совместимости с Consta UI) */
    view?: 'primary' | 'secondary' | 'ghost' | 'link' | 'warning' | 'alert' | 'success';
}

/**
 * Универсальный компонент типографики для замены Text из Consta UI
 */
const Typography = React.forwardRef<HTMLElement, TypographyProps>(
    ({ className, variant, align, weight, size, view, as, children, ...props }, ref) => {
        // Определяем элемент для рендера
        const getElement = (): keyof JSX.IntrinsicElements => {
            if (as) return as;

            switch (variant) {
                case 'h1':
                    return 'h1';
                case 'h2':
                    return 'h2';
                case 'h3':
                    return 'h3';
                case 'h4':
                    return 'h4';
                case 'h5':
                    return 'h5';
                case 'h6':
                    return 'h6';
                case 'p':
                case 'body':
                case 'lead':
                    return 'p';
                case 'blockquote':
                    return 'blockquote';
                case 'list':
                    return 'ul';
                case 'inline-code':
                    return 'code';
                case 'small':
                case 'muted':
                case 'caption':
                    return 'span';
                default:
                    return 'span';
            }
        };

        // Преобразование size в variant для совместимости
        const getSizeVariant = () => {
            if (variant) return variant;

            switch (size) {
                case 'xs':
                    return 'caption';
                case 's':
                    return 'small';
                case 'm':
                    return 'body';
                case 'l':
                    return 'large';
                case 'xl':
                    return 'h4';
                case '2xl':
                    return 'h3';
                case '3xl':
                    return 'h2';
                case '4xl':
                    return 'h1';
                default:
                    return 'body';
            }
        };

        // Преобразование view в дополнительные классы
        const getViewClasses = () => {
            switch (view) {
                case 'secondary':
                    return 'text-muted-foreground';
                case 'ghost':
                    return 'text-muted-foreground/60';
                case 'link':
                    return 'text-primary hover:underline cursor-pointer';
                case 'warning':
                    return 'text-yellow-600 dark:text-yellow-400';
                case 'alert':
                    return 'text-red-600 dark:text-red-400';
                case 'success':
                    return 'text-green-600 dark:text-green-400';
                default:
                    return '';
            }
        };

        const Element = getElement();
        const finalVariant = getSizeVariant();

        return React.createElement(
            Element,
            {
                className: cn(
                    typographyVariants({ variant: finalVariant, align, weight }),
                    getViewClasses(),
                    className,
                ),
                ref,
                ...props,
            },
            children,
        );
    },
);

Typography.displayName = 'Typography';

// Компонент для совместимости с Consta UI Text API
export interface TextProps extends TypographyProps {
    /** Для совместимости с Consta UI */
    truncate?: boolean;
}

/**
 * Компонент Text для полной совместимости с Consta UI API
 */
export const Text = React.forwardRef<HTMLElement, TextProps>(
    ({ truncate, className, ...props }, ref) => {
        return (
            <Typography ref={ref} className={cn(truncate && 'truncate', className)} {...props} />
        );
    },
);

Text.displayName = 'Text';

export { Typography, typographyVariants };

