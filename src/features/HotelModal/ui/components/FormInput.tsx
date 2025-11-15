'use client';

import { Input } from '@/components/ui/input';
import { FormField } from './FormField';

interface FormInputProps {
    label: string;
    required?: boolean;
    error?: string;
    value?: string;
    onChange: (value: string) => void;
    placeholder: string;
    disabled?: boolean;
    className?: string;
    htmlFor?: string;
    type?: string;
}

export const FormInput: React.FC<FormInputProps> = ({
    label,
    required = false,
    error,
    value,
    onChange,
    placeholder,
    disabled = false,
    className,
    htmlFor,
    type = 'text',
}) => {
    return (
        <FormField label={label} required={required} error={error} htmlFor={htmlFor}>
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
                type={type}
            />
        </FormField>
    );
};
