'use client';

import MultipleSelector, { Option } from '@/components/ui/multiple-selector';
import { FormField } from './FormField';

interface FormMultipleSelectorProps {
    label: string;
    required?: boolean;
    error?: string;
    value?: Option[];
    onChange: (value: Option[]) => void;
    options: Option[];
    placeholder: string;
    disabled?: boolean;
    emptyIndicator?: React.ReactNode;
    className?: string;
    htmlFor?: string;
}

export const FormMultipleSelector: React.FC<FormMultipleSelectorProps> = ({
    label,
    required = false,
    error,
    value = [],
    onChange,
    options,
    placeholder,
    disabled = false,
    emptyIndicator,
    className,
    htmlFor,
}) => {
    return (
        <FormField label={label} required={required} error={error} htmlFor={htmlFor}>
            <MultipleSelector
                options={options}
                value={value}
                onChange={onChange}
                disabled={disabled}
                emptyIndicator={emptyIndicator}
                hidePlaceholderWhenSelected
                placeholder={placeholder}
                className={className}
            />
        </FormField>
    );
};
