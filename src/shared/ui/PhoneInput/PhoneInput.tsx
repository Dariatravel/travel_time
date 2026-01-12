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
  // В проекте уже передают этот проп в PhoneInput (ReserveInfo.tsx),
  // поэтому оставляем для совместимости (можно не использовать внутри).
  error?: string;
}

const digitsOnly = (s: string) => (s || '').replace(/\D/g, '');

/**
 * Формат РФ номера по маске +7(XXX)XXX-XX-XX
 * На входе digits:
 * - либо 11 цифр, где первая "7"
 * - либо 10 цифр без страны (тогда будет добавлена "7")
 */
const formatRu = (digits: string): string => {
  if (!digits) return '';

  let d = digitsOnly(digits);

  // 8XXXXXXXXXX -> 7XXXXXXXXXX
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`;

  // 10 цифр -> РФ, добавляем 7
  if (d.length === 10) d = `7${d}`;

  // Если не РФ - просто отдаем цифры как есть (на всякий случай)
  if (!(d.length >= 1 && d.startsWith('7'))) return d;

  // Ограничиваем 11 цифрами (7 + 10)
  d = d.slice(0, 11);

  if (d.length <= 1) return '+7';
  if (d.length <= 4) return `+7(${d.slice(1)}`;
  if (d.length <= 7) return `+7(${d.slice(1, 4)})${d.slice(4)}`;
  if (d.length <= 9) return `+7(${d.slice(1, 4)})${d.slice(4, 7)}-${d.slice(7)}`;

  return `+7(${d.slice(1, 4)})${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
};

/**
 * Нормализация международного номера (E.164-ish):
 * - сохраняем + если он был
 * - до 15 цифр
 */
const normalizeInternational = (raw: string): string => {
  const trimmed = (raw || '').trim();
  const hasPlus = trimmed.startsWith('+');
  const d = digitsOnly(trimmed).slice(0, 15);
  if (!d) return '';
  return hasPlus ? `+${d}` : d;
};

/**
 * Определяем, что ввод/вставка похожи на международный номер (не РФ):
 * - есть + и не +7
 * - либо просто много цифр (>11) и не начинается с 7/8
 * - либо начинается с кода страны (например 375...) и длина > 10
 */
const shouldTreatAsInternational = (raw: string, d: string): boolean => {
  const trimmed = (raw || '').trim();
  if (trimmed.startsWith('+') && !trimmed.startsWith('+7')) return true;

  // если цифр больше 11 и это не РФ
  if (d.length > 11 && !d.startsWith('7') && !d.startsWith('8')) return true;

  // если цифр больше 10 и это не похоже на РФ (например 375..., 380..., 49..., etc.)
  if (d.length > 10 && !d.startsWith('7') && !d.startsWith('8')) return true;

  return false;
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
    const cleanPhone = digitsOnly(phone);
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  };

  const handleChange = (
    raw: string,
    onChange: (value: string) => void,
    previousValue: string = '',
  ) => {
    // если удаляют - не мешаем
    if (raw.length < (previousValue || '').length) {
      const d = digitsOnly(raw);
      if (!d) {
        onChange('');
        return;
      }
    }

    const d = digitsOnly(raw);

    if (!d) {
      onChange('');
      return;
    }

    // Международные - не навязываем +7
    if (shouldTreatAsInternational(raw, d)) {
      onChange(normalizeInternational(raw));
      return;
    }

    // РФ сценарии:
    // - +7...
    // - 7XXXXXXXXXX
    // - 8XXXXXXXXXX
    // - 10 цифр без страны
    if (d.length === 10) {
      onChange(formatRu(d));
      return;
    }

    if (d.length >= 1 && (d.startsWith('7') || d.startsWith('8'))) {
      onChange(formatRu(d));
      return;
    }

    // На всякий случай
    onChange(normalizeInternational(raw));
  };

  const handlePaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    onChange: (value: string) => void,
  ) => {
    event.preventDefault();

    const pastedRaw = (event.clipboardData.getData('text') || '').trim();
    const d = digitsOnly(pastedRaw);

    if (!d) return;

    const hasPlus = pastedRaw.startsWith('+');

    // Если явно международный (+ и не +7) - сохраняем как международный
    if (hasPlus && !pastedRaw.startsWith('+7')) {
      onChange(`+${d.slice(0, 15)}`);
      return;
    }

    // РФ кейсы вставки:
    // +7XXXXXXXXXX
    // 8XXXXXXXXXX
    // 7XXXXXXXXXX
    // 10 цифр без страны
    if (d.length === 11 && (d.startsWith('7') || d.startsWith('8'))) {
      onChange(formatRu(d));
      return;
    }

    if (d.length === 10) {
      onChange(formatRu(d));
      return;
    }

    // Всё, что длиннее 10 и не РФ - считаем международным (Беларусь, и т.д.)
    if (d.length > 10 && !d.startsWith('7') && !d.startsWith('8')) {
      onChange(`+${d.slice(0, 15)}`);
      return;
    }

    // fallback
    onChange(hasPlus ? `+${d.slice(0, 15)}` : d.slice(0, 15));
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
                handlePaste(event, field.onChange)
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
