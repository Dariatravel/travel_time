'use client';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { FormField } from './FormField';

interface SelectOption {
    value: string;
    label: string;
}

interface FormSelectProps {
    label: string;
    required?: boolean;
    error?: string;
    value?: string;
    onValueChange: (value: string) => void;
    options: SelectOption[];
    placeholder: string;
    disabled?: boolean;
    className?: string;
    htmlFor?: string;
}

export const FormSelect: React.FC<FormSelectProps> = ({
    label,
    required = false,
    error,
    value,
    onValueChange,
    options,
    placeholder,
    disabled = false,
    className,
    htmlFor,
}) => {
    return (
        <FormField label={label} required={required} error={error} htmlFor={htmlFor}>
            <Select value={value} onValueChange={onValueChange} disabled={disabled}>
                <SelectTrigger className={className}>
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </FormField>
    );
};
