import { cn } from '@/lib/utils';
import * as React from 'react';

export interface FormTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
    children: React.ReactNode;
}

export const FormTitle = React.forwardRef<HTMLHeadingElement, FormTitleProps>(
    ({ className, children, ...props }, ref) => {
        return (
            <h2
                ref={ref}
                className={cn('text-2xl font-semibold leading-none tracking-tight mb-6', className)}
                {...props}
            >
                {children}
            </h2>
        );
    },
);

FormTitle.displayName = 'FormTitle';


