'use client';

import { Textarea } from '@/components/ui/textarea';
import { FormField } from './FormField';

interface FormTextareaProps {
    label: string;
    required?: boolean;
    error?: string;
    value?: string;
    onChange: (value: string) => void;
    placeholder: string;
    disabled?: boolean;
    className?: string;
    htmlFor?: string;
    rows?: number;
}

export const FormTextarea: React.FC<FormTextareaProps> = ({
    label,
    required = false,
    error,
    value,
    onChange,
    placeholder,
    disabled = false,
    className,
    htmlFor,
    rows = 3,
}) => {
    return (
        <FormField label={label} required={required} error={error} htmlFor={htmlFor}>
            <Textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
                rows={rows}
            />
        </FormField>
    );
};
