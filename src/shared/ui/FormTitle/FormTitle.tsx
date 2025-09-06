import { cn } from '@/lib/utils';
import { FC, ReactNode } from 'react';

export interface FormTitleProps extends React.HTMLAttributes<HTMLParagraphElement> {
    children: ReactNode;
    className?: string;
}

export const FormTitle: FC<FormTitleProps> = ({ children, className, ...rest }: FormTitleProps) => {
    return (
        <p className={cn('scroll-m-20 text-xl font-semibold tracking-tight', className)} {...rest}>
            {children}
        </p>
    );
};
