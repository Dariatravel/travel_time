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
                hidePlaceholderWhenSelected
                placeholder={placeholder}
            />
        </FormField>
    );
};
