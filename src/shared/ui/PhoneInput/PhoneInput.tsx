import { FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { FaTelegram } from 'react-icons/fa';
import { IoLogoWhatsapp } from 'react-icons/io';
import { LinkIcon } from '../LinkIcon/LinkIcon';

interface PhoneInputProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  showWhatsapp?: boolean;
  showTelegram?: boolean;
  size?: 'xs' | 's' | 'm' | 'l';
}

// Нормализация международного номера в формате E.164: + и до 15 цифр
const normalizeInternational = (value: string): string => {
  const trimmed = (value || '').trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  const limited = digits.slice(0, 15);
  return hasPlus ? `+${limited}` : limited;
};

// Форматирование РФ номера в маску +7(XXX)XXX-XX-XX
const formatRu = (value: string, previousValue: string = ''): string => {
  const isDeleting = value.length < previousValue.length;

  if (value === '' || value === '+' || value === '+7') return '';

  let numbers = value.replace(/\D/g, '');
  if (!numbers) return '';

  // 8XXXXXXXXXX -> 7XXXXXXXXXX
  if (numbers.startsWith('8')) numbers = `7${numbers.slice(1)}`;

  // если вводят 10 цифр без страны - считаем РФ и добавляем 7
  if (!numbers.startsWith('7') && numbers.length === 10 && !isDeleting) {
    numbers = `7${numbers}`;
  }

  // если не начинается с 7 и это не удаление - раньше добавляли 7 всегда
  // теперь не навязываем 7 для стран кроме РФ: оставим как есть (как digits)
  if (!numbers.startsWith('7') && !isDeleting) {
    return numbers.slice(0, 15);
  }

  if (isDeleting && numbers === '7') return '';

  numbers = numbers.slice(0, 11);

  if (numbers.length <= 1) return numbers === '7' ? '+7' : '';
  if (numbers.length <= 4) return `+7(${numbers.slice(1)}`;
  if (numbers.length <= 7) return `+7(${numbers.slice(1, 4)})${numbers.slice(4)}`;
  if (numbers.length <= 9)
    return `+7(${numbers.slice(1, 4)})${numbers.slice(4, 7)}-${numbers.slice(7)}`;

  return `+7(${numbers.slice(1, 4)})${numbers.slice(4, 7)}-${numbers.slice(7, 9)}-${numbers.slice(9)}`;
};

const isInternationalInput = (value: string): boolean => {
  const trimmed = (value || '').trim();
  return trimmed.startsWith('+') && !trimmed.startsWith('+7');
};

export const PhoneInput = <T extends FieldValues>({
  control,
  name,
  label = 'Номер телефона',
  placeholder = '+7 (...) или +375...',
  disabled,
  className,
  required,
  showWhatsapp = false,
  showTelegram = false,
}: PhoneInputProps<T>) => {
  const createWhatsappLink = (phone: string, message: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  };

  const handleChange = (
    raw: string,
    onChange: (value: string) => void,
    previousValue: string = '',
  ) => {
    const next = isInternationalInput(raw) ? normalizeInternational(raw) : formatRu(raw, previousValue);
    onChange(next);
  };

  const handlePaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    onChange: (value: string) => void,
    currentValue: string = '',
  ) => {
    event.preventDefault();

    const pasted = (event.clipboardData.getData('text') || '').trim();
    if (!pasted) return;

    const hasPlus = pasted.startsWith('+');
    let digits = pasted.replace(/\D/g, '');
    if (!digits) return;

    // Если вставляют номер с + и это не РФ (+7), оставляем международный E.164
    if (hasPlus && !pasted.startsWith('+7')) {
      const intl = `+${digits.slice(0, 15)}`;
      onChange(intl);
      return;
    }

    // РФ кейсы:
    // +7XXXXXXXXXX, 8XXXXXXXXXX, 7XXXXXXXXXX, либо просто 10 цифр
    if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    if (digits.length === 11 && digits.startsWith('7')) {
      const formatted = formatRu(`+${digits}`, currentValue);
      onChange(formatted);
      return;
    }

    // 10 цифр без префикса - считаем РФ
    if (digits.length === 10) {
      const formatted = formatRu(`7${digits}`, currentValue);
      onChange(formatted);
      return;
    }

    // Иначе не режем до 10 и не навязываем +7 - просто сохраняем как есть (до 15 цифр)
    const fallback = digits.slice(0, 15);
    onChange(hasPlus ? `+${fallback}` : fallback);
  };

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div>
          <FormLabel>
            {label} {required ? <span className="text-red-600">*</span> : null}
          </FormLabel>

          <div className="relative">
            <Input
              {...field}
              value={field.value || ''}
              placeholder={placeholder}
              required={required}
              type="tel"
              disabled={disabled}
              className={className}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                handleChange(event.target.value, field.onChange, field.value || '')
              }
              onPaste={(event: React.ClipboardEvent<HTMLInputElement>) =>
                handlePaste(event, field.onChange, field.value || '')
              }
            />

            <div className="absolute top-1/2 -translate-y-1/2 right-2">
              {showWhatsapp && field.value && (
                <LinkIcon
                  icon={<IoLogoWhatsapp color="#5BD066" size={'24px'} />}
                  link={createWhatsappLink(field.value, 'Добрый день')}
                />
              )}
              {showTelegram && field.value && (
                <LinkIcon icon={<FaTelegram color="2AABEE" size={'24px'} />} link={field.value} />
              )}
            </div>
          </div>

          <FormMessage />
        </div>
      )}
    />
  );
};
