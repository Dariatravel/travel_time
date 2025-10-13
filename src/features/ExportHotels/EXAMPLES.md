# Примеры использования ExportHotels

## Пример 1: Базовое использование в компоненте

```tsx
import { ExportHotelsButton } from '@/features/ExportHotels';

export const MySearchForm = () => {
    return (
        <div className="flex gap-2">
            <input placeholder="Поиск..." />
            <ExportHotelsButton />
            <button>Найти</button>
        </div>
    );
};
```

## Пример 2: Кастомная кнопка с модалкой

```tsx
import { ExportHotelsModal } from '@/features/ExportHotels';
import { useState } from 'react';
import { useUnit } from 'effector-react';
import { $hotelsFilter } from '@/shared/models/hotels';

export const CustomExportButton = () => {
    const [isOpen, setIsOpen] = useState(false);
    const hotelsFilter = useUnit($hotelsFilter);
    const hotels = hotelsFilter?.hotels || [];

    return (
        <>
            <button onClick={() => setIsOpen(true)} className="custom-button">
                📤 Экспорт
            </button>

            <ExportHotelsModal isOpen={isOpen} onClose={() => setIsOpen(false)} hotels={hotels} />
        </>
    );
};
```

## Пример 3: Программный экспорт без UI

```tsx
import { formatHotelsAsPlainText, copyToClipboard } from '@/features/ExportHotels';
import { showToast } from '@/shared/ui/Toast/Toast';

export const programmaticExport = async (hotels: HotelForRoom[]) => {
    try {
        const text = formatHotelsAsPlainText(hotels);
        const success = await copyToClipboard(text);

        if (success) {
            showToast('Список отелей скопирован', 'success');
        } else {
            throw new Error('Ошибка копирования');
        }
    } catch (error) {
        showToast('Не удалось скопировать', 'error');
    }
};
```

## Пример 4: Экспорт с фильтрацией

```tsx
import { formatHotelsAsPlainText, copyToClipboard } from '@/features/ExportHotels';

export const exportOnlyWithTelegram = async (hotels: HotelForRoom[]) => {
    // Фильтруем только отели с Telegram
    const hotelsWithTelegram = hotels.filter((hotel) => hotel.telegram_url);

    const text = formatHotelsAsPlainText(hotelsWithTelegram);
    await copyToClipboard(text);
};
```

## Пример 5: Кастомное форматирование

```tsx
import { copyToClipboard } from '@/features/ExportHotels';
import { HotelForRoom } from '@/shared/api/hotel/hotel';

const customFormat = (hotels: HotelForRoom[]): string => {
    const header = '🏨 Мои отели:\n\n';

    const list = hotels
        .map(
            (hotel, i) =>
                `${i + 1}. ${hotel.title}\n` +
                `   📍 ${hotel.address || 'Адрес не указан'}\n` +
                `   📱 ${hotel.phone || 'Телефон не указан'}\n` +
                `   💬 ${hotel.telegram_url || 'Нет Telegram'}`,
        )
        .join('\n\n');

    return header + list;
};

export const exportWithCustomFormat = async (hotels: HotelForRoom[]) => {
    const text = customFormat(hotels);
    await copyToClipboard(text);
};
```

## Пример 6: Экспорт с счетчиком

```tsx
import { ExportHotelsButton } from '@/features/ExportHotels';
import { useUnit } from 'effector-react';
import { $hotelsFilter } from '@/shared/models/hotels';

export const ExportWithCounter = () => {
    const hotelsFilter = useUnit($hotelsFilter);
    const count = hotelsFilter?.hotels?.length || 0;

    return (
        <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Отелей найдено: {count}</span>
            <ExportHotelsButton />
        </div>
    );
};
```

## Пример 7: Экспорт в разных форматах

```tsx
import { HotelForRoom } from '@/shared/api/hotel/hotel';
import { copyToClipboard } from '@/features/ExportHotels';

type ExportFormat = 'telegram' | 'whatsapp' | 'plain';

const formatByType = (hotels: HotelForRoom[], format: ExportFormat): string => {
    const header = {
        telegram: '📋 *Список отелей*\n\n',
        whatsapp: '📋 Список отелей\n\n',
        plain: 'Список отелей\n\n',
    }[format];

    const formatHotel = (hotel: HotelForRoom, index: number) => {
        const base = `${index + 1}. ${hotel.title}`;

        switch (format) {
            case 'telegram':
                return `*${base}*\n   ${hotel.telegram_url ? `[Telegram](${hotel.telegram_url})` : 'Нет ссылки'}`;
            case 'whatsapp':
            case 'plain':
            default:
                return `${base}\n   Telegram: ${hotel.telegram_url || 'Нет ссылки'}`;
        }
    };

    return header + hotels.map(formatHotel).join('\n\n');
};

export const exportInFormat = async (hotels: HotelForRoom[], format: ExportFormat = 'plain') => {
    const text = formatByType(hotels, format);
    await copyToClipboard(text);
};
```

## Пример 8: Экспорт с дополнительной информацией

```tsx
import { HotelForRoom } from '@/shared/api/hotel/hotel';
import { copyToClipboard } from '@/features/ExportHotels';

interface ExtendedExportOptions {
    includeAddress?: boolean;
    includePhone?: boolean;
    includeRating?: boolean;
}

const formatExtended = (hotels: HotelForRoom[], options: ExtendedExportOptions = {}): string => {
    const { includeAddress, includePhone, includeRating } = options;

    const header = '📋 Список отелей\n\n';

    const list = hotels
        .map((hotel, i) => {
            let text = `${i + 1}. ${hotel.title}`;

            if (includeRating && hotel.rating) {
                text += `\n   ⭐ Рейтинг: ${hotel.rating}/5`;
            }

            if (includeAddress && hotel.address) {
                text += `\n   📍 ${hotel.address}`;
            }

            if (includePhone && hotel.phone) {
                text += `\n   📱 ${hotel.phone}`;
            }

            if (hotel.telegram_url) {
                text += `\n   💬 ${hotel.telegram_url}`;
            }

            return text;
        })
        .join('\n\n');

    return header + list;
};

export const exportExtended = async (hotels: HotelForRoom[], options?: ExtendedExportOptions) => {
    const text = formatExtended(hotels, options);
    await copyToClipboard(text);
};
```

## Пример 9: Экспорт с группировкой по городам

```tsx
import { HotelForRoom } from '@/shared/api/hotel/hotel';
import { copyToClipboard } from '@/features/ExportHotels';

const formatByCity = (hotels: HotelForRoom[]): string => {
    // Группируем по городам
    const byCity = hotels.reduce(
        (acc, hotel) => {
            const city = hotel.city || 'Без города';
            if (!acc[city]) acc[city] = [];
            acc[city].push(hotel);
            return acc;
        },
        {} as Record<string, HotelForRoom[]>,
    );

    let text = '📋 Список отелей по городам\n\n';

    Object.entries(byCity).forEach(([city, cityHotels]) => {
        text += `🏙️ ${city}\n`;
        cityHotels.forEach((hotel, i) => {
            text += `  ${i + 1}. ${hotel.title}\n`;
            if (hotel.telegram_url) {
                text += `     💬 ${hotel.telegram_url}\n`;
            }
        });
        text += '\n';
    });

    return text;
};

export const exportByCity = async (hotels: HotelForRoom[]) => {
    const text = formatByCity(hotels);
    await copyToClipboard(text);
};
```

## Пример 10: React Hook для экспорта

```tsx
import { useState, useCallback } from 'react';
import { useUnit } from 'effector-react';
import { $hotelsFilter } from '@/shared/models/hotels';
import { formatHotelsAsPlainText, copyToClipboard } from '@/features/ExportHotels';
import { showToast } from '@/shared/ui/Toast/Toast';

export const useExportHotels = () => {
    const [isExporting, setIsExporting] = useState(false);
    const hotelsFilter = useUnit($hotelsFilter);
    const hotels = hotelsFilter?.hotels || [];

    const exportHotels = useCallback(async () => {
        if (hotels.length === 0) {
            showToast('Нет отелей для экспорта', 'warning');
            return false;
        }

        setIsExporting(true);
        try {
            const text = formatHotelsAsPlainText(hotels);
            const success = await copyToClipboard(text);

            if (success) {
                showToast('Список отелей скопирован', 'success');
                return true;
            } else {
                throw new Error('Ошибка копирования');
            }
        } catch (error) {
            showToast('Не удалось скопировать', 'error');
            return false;
        } finally {
            setIsExporting(false);
        }
    }, [hotels]);

    return {
        exportHotels,
        isExporting,
        hotelsCount: hotels.length,
        hasHotels: hotels.length > 0,
    };
};

// Использование:
export const MyComponent = () => {
    const { exportHotels, isExporting, hotelsCount, hasHotels } = useExportHotels();

    return (
        <button onClick={exportHotels} disabled={!hasHotels || isExporting}>
            {isExporting ? 'Экспорт...' : `Экспорт (${hotelsCount})`}
        </button>
    );
};
```

## Запуск примеров

Все примеры можно запустить в вашем проекте:

1. Скопируйте нужный пример
2. Импортируйте необходимые зависимости
3. Адаптируйте под свои нужды
4. Запустите и тестируйте!

## Тестирование

```typescript
// Тестовые данные
const mockHotels: HotelForRoom[] = [
    {
        id: '1',
        title: 'Тестовый отель 1',
        telegram_url: 'https://t.me/test1',
        address: 'ул. Тестовая, 1',
        phone: '+7(999)123-45-67',
        rating: 4.5,
        city: 'Москва',
    },
    {
        id: '2',
        title: 'Тестовый отель 2',
        telegram_url: 'https://t.me/test2',
        address: 'пр. Тестовый, 2',
        phone: '+7(999)765-43-21',
        rating: 4.8,
        city: 'Санкт-Петербург',
    },
];

// Тестирование форматирования
console.log(formatHotelsAsPlainText(mockHotels));

// Тестирование копирования
await copyToClipboard(formatHotelsAsPlainText(mockHotels));
```
