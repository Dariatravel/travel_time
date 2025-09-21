import { Input } from '@/components/ui/input';
import { memo } from 'react';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { FaTelegram } from 'react-icons/fa';
import { IoLogoWhatsapp } from 'react-icons/io';
import { ReactMaskOpts, useIMask } from 'react-imask';
import { LinkIcon } from '../LinkIcon/LinkIcon';

interface PhoneInputProps<T extends FieldValues> {
    control: Control<T>;
    name: Path<T>;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    error?: string;
    required?: boolean;
    showWhatsapp?: boolean;
    showTelegram?: boolean;
    size?: 'xs' | 's' | 'm' | 'l';
}

const InputMemo = memo(Input);
export const PhoneInput = <T extends FieldValues>({
    control,
    name,
    label = 'Номер телефона',
    placeholder = '+7 (...)',
    disabled,
    className,
    required,
    showWhatsapp = false,
    showTelegram = false,
    size = 's',
}: PhoneInputProps<T>) => {
    const { ref, value } = useIMask<HTMLInputElement, ReactMaskOpts>({
        mask: '+{7}(000)000-00-00',
    });

    const createWhatsappLink = (phone: string, message: string) => {
        const cleanPhone = phone.replace(/\D/g, '');
        return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    };
    return (
        <Controller
            control={control}
            name={name}
            rules={{ required: 'Номер телефона обязателен для заполнения' }}
            render={({ field, fieldState: { error } }) => {
                return (
                    <InputMemo
                        defaultValue={field?.value}
                        ref={ref}
                        onChange={field?.onChange}
                        placeholder={placeholder}
                        type="tel"
                        disabled={disabled}
                        className={className}
                        rightSide={() => {
                            if (showWhatsapp && value) {
                                return (
                                    <LinkIcon
                                        icon={<IoLogoWhatsapp color="#5BD066" size={'24px'} />}
                                        link={createWhatsappLink(value, 'Добрый день')}
                                    />
                                );
                            }
                            if (showTelegram && value) {
                                return (
                                    <LinkIcon
                                        icon={<FaTelegram color="2AABEE" size={'24px'} />}
                                        link={value}
                                    />
                                );
                            }
                            return null;
                        }}
                    />
                );
            }}
        />
    );
};
