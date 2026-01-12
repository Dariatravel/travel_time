import { FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { Controller } from 'react-hook-form';
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
  // В проекте уже передают этот проп в PhoneInput (ReserveInfo.tsx),
  // поэтому оставляем для совместимости (внутри не обязаны использовать).
  error?: string;
}

const digitsOnly = (s: string) => (s ?? '').replace(/\D/g, '');

const isRuMask = (v: string) => /^\+7\(\d{3}\)\d{3}-\d{2}-\d{2}$/.test(v);
const isInternationalE164ish = (v: string) => /^\+\d{10,15}$/.test(v);

const formatRuFromDigits = (digits: string): string => {
  let d = digitsOnly(digits);

  // 8XXXXXXXXXX -> 7XXXXXXXXXX
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`;

  // 10 цифр -> РФ, добавляем 7
  if (d.length === 10) d = `7${d}`;

  // не РФ - возвращаем как есть (digits)
  if (!d.startsWith('7')) return d;

  d = d.slice(0, 11);

  if (d.length <= 1) return '+7';
  if (d.length <= 4) return `+7(${d.slice(1)}`;
  if (d.length <= 7) return `+7(${d.slice(1, 4)})${d.slice(4)}`;
  if (d.length <= 9) return `+7(${d.slice(1, 4)})${d.slice(4, 7)}-${d.slice(7)}`;

  return `+7(${d.slice(1, 4)})${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
};

const normalizeInternational = (raw: string): string => {
  const trimmed = (raw ?? '').trim();
  const d = digitsOnly(trimmed).slice(0, 15);
  if (!d) return '';
  return `+${d}`;
};

/**
 * Решение что считать "международным":
 * 1) если строка начинается с '+' и не '+7' -> международный
 * 2) если цифр > 11 и это не РФ (не 7/8) -> международный
 * 3) если цифр > 10 и это не похоже на РФ (не 7/8) -> международный
 */
const shouldTreatAsInternational = (raw: string, digits: string): boolean => {
  const trimmed = (raw ?? '').trim();
  if (trimmed.startsWith('+') && !trimmed.startsWith('+7')) return true;

  if (digits.length > 11 && !digits.startsWith('7') && !digits.startsWith('8')) return true;
  if (digits.length > 10 && !digits.startsWith('7') && !digits.startsWith('8')) return true;

  return false;
};

const createWhatsappLink = (phone: string, message: string) => {
  const cleanPhone = digitsOnly(phone);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
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
  const handleChange = (raw: string, prev: string): string => {
    // если поле очистили
    if (!raw) return '';

    // если уже валидный финальный вид - не переформатируем
    if (isRuMask(raw) || isInternationalE164ish(raw)) return raw;

    const d = digitsOnly(raw);
    if (!d) return '';

    // если удаляют - даем удалять, но все равно держим формат разумным
    const isDeleting = raw.length < (prev ?? '').length;

    // Международные - не навязываем РФ маску
    if (shouldTreatAsInternational(raw, d)) {
      return normalizeInternational(raw);
    }

    // РФ сценарии: 10 цифр или начинается с 7/8
    if (d.length === 10) return formatRuFromDigits(d);
    if (d.startsWith('7') || d.startsWith('8')) return formatRuFromDigits(d);

    // если удаляют и не похоже на РФ - просто нормализуем в +
    if (isDeleting) return normalizeInternational(raw);

    // fallback
    return normalizeInternational(raw);
  };

  const handlePaste = (pastedRaw: string): string => {
    const raw = (pastedRaw ?? '').trim();
    const d = digitsOnly(raw);
    if (!d) return '';

    // если явно + и не +7 -> международный
    if (raw.startsWith('+') && !raw.startsWith('+7')) {
      return `+${d.slice(0, 15)}`;
    }

    // РФ кейсы:
    if (d.length === 11 && (d.startsWith('7') || d.startsWith('8'))) return formatRuFromDigits(d);
    if (d.length === 10) return formatRuFromDigits(d);

    // всё что >10 и не РФ - международный
    if (d.length > 10 && !d.startsWith('7') && !d.startsWith('8')) {
      return `+${d.slice(0, 15)}`;
    }

    // fallback
    return raw.startsWith('+') ? `+${d.slice(0, 15)}` : d.slice(0, 15);
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
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                const next = handleChange(event.target.value, String(field.value ?? ''));
                field.onChange(next);
              }}
              onPaste={(event: React.ClipboardEvent<HTMLInputElement>) => {
                event.preventDefault();
                const pasted = event.clipboardData.getData('text');
                const next = handlePaste(pasted);
                field.onChange(next);
              }}
            />

            <div className="absolute top-1/2 -translate-y-1/2 right-2">
              {showWhatsapp && field.value && (
                <LinkIcon
                  icon={<IoLogoWhatsapp color="#5BD066" size={'24px'} />}
                  link={createWhatsappLink(String(field.value), 'Добрый день')}
                />
              )}
              {showTelegram && field.value && (
                <LinkIcon
                  icon={<FaTelegram color="2AABEE" size={'24px'} />}
                  link={String(field.value)}
                />
              )}
            </div>
          </div>

          <FormMessage />
        </div>
      )}
    />
  );
};
