'use client';

import { Label } from '@/components/ui/label';
import { ReactNode } from 'react';

interface FormFieldProps {
    label: string;
    required?: boolean;
    error?: string;
    children: ReactNode;
    htmlFor?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
    label,
    required = false,
    error,
    children,
    htmlFor,
}) => {
    return (
        <div className="space-y-2">
            <Label htmlFor={htmlFor}>
                {label} {required && <span className="text-destructive">*</span>}
            </Label>
            {children}
            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    );
};
