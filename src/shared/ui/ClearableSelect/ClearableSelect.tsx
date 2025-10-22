// src/shared/ui/ClearableSelect/ClearableSelect.tsx
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import { FC } from 'react';

interface Option {
    value: string;
    label: string;
}

interface ClearableSelectProps {
    value?: string;
    onValueChange: (value: string) => void;
    options: Option[];
    placeholder?: string;
    className?: string;
    clearable?: boolean;
}

export const ClearableSelect: FC<ClearableSelectProps> = ({
    value,
    onValueChange,
    options,
    placeholder,
    className,
    clearable = true,
}) => {
    return (
        <div className="relative">
            <Select value={value} onValueChange={onValueChange}>
                <SelectTrigger className={className}>
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent className="relative">
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}{' '}
                </SelectContent>{' '}
            </Select>{' '}
            {clearable && value && (
                <Button
                    variant="ghost"
                    type="button"
                    onClick={() => onValueChange('')}
                    className="absolute right-8 top-1/2 -translate-y-1/2 h-8 w-8 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring p-0"
                >
                    <X size={16} />
                </Button>
            )}
        </div>
    );
};
