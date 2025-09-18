import { FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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

    /**
     * Функция для форматирования даты с автопроставлением точек
     * @param value - введенное значение
     * @returns отформатированная строка даты
     */
    const formatDateInput = (value: string): string => {
        // Убираем все нецифровые символы
        const numbers = value.replace(/\D/g, '');

        // Ограничиваем длину до 8 цифр (ддммгггг)
        const limitedNumbers = numbers.slice(0, 8);

        // Добавляем точки автоматически
        if (limitedNumbers.length <= 2) {
            return limitedNumbers;
        } else if (limitedNumbers.length <= 4) {
            return `${limitedNumbers.slice(0, 2)}/${limitedNumbers.slice(2)}`;
        } else {
            return `${limitedNumbers.slice(0, 2)}/${limitedNumbers.slice(2, 4)}/${limitedNumbers.slice(4)}`;
        }
    };
    const handleDateChange = (value: string, onChange: (value: string) => void) => {
        const formattedValue = formatDateInput(value);
        onChange(formattedValue);
    };

    /**
     * Функция для форматирования телефона с автодобавлением +7
     * @param value - введенное значение
     * @param previousValue - предыдущее значение для определения операции удаления
     * @returns отформатированная строка телефона
     */
    const formatPhoneInput = (value: string, previousValue: string = ''): string => {
        // Проверяем, происходит ли удаление
        const isDeleting = value.length < previousValue.length;

        // Если пользователь полностью очистил поле или удаляет и остался только "+7"
        if (value === '' || value === '+' || value === '+7') {
            return '';
        }

        // Убираем все нецифровые символы
        let numbers = value.replace(/\D/g, '');

        // Если нет цифр, возвращаем пустую строку
        if (numbers.length === 0) {
            return '';
        }

        // Если пользователь начинает с 8, заменяем на 7
        if (numbers.startsWith('8')) {
            numbers = '7' + numbers.slice(1);
        }

        // Если не начинается с 7 и не происходит удаление, добавляем 7 в начало
        if (!numbers.startsWith('7') && !isDeleting) {
            numbers = '7' + numbers;
        }

        // Если при удалении остается только "7", возвращаем пустую строку
        if (isDeleting && numbers === '7') {
            return '';
        }

        // Ограничиваем длину до 11 цифр (7 + 10 цифр номера)
        numbers = numbers.slice(0, 11);

        // Форматируем в +7 (XXX) XXX-XX-XX
        if (numbers.length <= 1) {
            return numbers === '7' ? '+7' : '';
        } else if (numbers.length <= 4) {
            return `+7 ${numbers.slice(1)}`;
        } else if (numbers.length <= 7) {
            return `+7 ${numbers.slice(1, 4)} ${numbers.slice(4)}`;
        } else if (numbers.length <= 9) {
            return `+7 ${numbers.slice(1, 4)} ${numbers.slice(4, 7)}-${numbers.slice(7)}`;
        } else {
            return `+7 ${numbers.slice(1, 4)} ${numbers.slice(4, 7)}-${numbers.slice(7, 9)}-${numbers.slice(9)}`;
        }
    };

    /**
     * Обработчик изменения поля телефона
     * @param value - новое значение поля
     * @param onChange - функция изменения значения из react-hook-form
     * @param previousValue - предыдущее значение поля
     */
    const handlePhoneChange = (
        value: string,
        onChange: (value: string) => void,
        previousValue: string = '',
    ) => {
        const formattedValue = formatPhoneInput(value, previousValue);
        onChange(formattedValue);
    };

    /**
     * Обработчик клика по полю телефона - автозаполнение "+7"
     * @param field - поле из react-hook-form
     */
    const handlePhoneClick = (field: any) => {
        // Если поле пустое, добавляем "+7"
        if (!field.value || field.value === '') {
            field.onChange('+7');
        }
    };

    return (
        <Controller
            control={control}
            name={name}
            rules={{ required: 'Номер телефона обязателен для заполнения' }}
            render={({ field, fieldState: { error } }) => {
                return (
                    <div>
                        <FormLabel>{label}</FormLabel>
                        <div>
                            <Input
                                {...field}
                                placeholder={placeholder}
                                required={required}
                                type="tel"
                                disabled={disabled}
                                className={className}
                                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                    handlePhoneChange(event.target.value, field.onChange)
                                }
                                onClick={() => handlePhoneClick(field)}
                            />
                            {showWhatsapp && value && (
                                <LinkIcon
                                    icon={<IoLogoWhatsapp color="#5BD066" size={'24px'} />}
                                    link={createWhatsappLink(value, 'Добрый день')}
                                />
                            )}
                            {showTelegram && value && (
                                <LinkIcon
                                    icon={<FaTelegram color="2AABEE" size={'24px'} />}
                                    link={value}
                                />
                            )}
                        </div>
                        <FormMessage />
                    </div>
                );
            }}
        />
    );
};
