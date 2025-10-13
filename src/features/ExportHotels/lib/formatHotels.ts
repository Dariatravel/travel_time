import { HotelForRoom } from '@/shared/api/hotel/hotel';

/**
 * Форматирует список отелей для копирования в Telegram/WhatsApp
 * @param hotels - массив отелей
 * @returns отформатированная строка для копирования
 */
export const formatHotelsForMessenger = (hotels: HotelForRoom[]): string => {
    if (!hotels || hotels.length === 0) {
        return 'Нет доступных отелей для экспорта';
    }

    const header = '📋 *Список отелей*\n\n';

    const hotelsList = hotels
        .map((hotel, index) => {
            const number = `${index + 1}.`;
            const title = hotel.title || 'Без названия';
            const telegramLink = hotel.telegram_url
                ? `[Telegram](${hotel.telegram_url})`
                : 'Нет ссылки';

            return `${number} *${title}*\n   ${telegramLink}`;
        })
        .join('\n\n');

    return `${header}${hotelsList}`;
};

/**
 * Форматирует список отелей в виде простого текста (для обычного копирования)
 * @param hotels - массив отелей
 * @returns отформатированная строка
 */
export const formatHotelsAsPlainText = (hotels: HotelForRoom[]): string => {
    if (!hotels || hotels.length === 0) {
        return 'Нет доступных отелей для экспорта';
    }

    const header = '📋 Список отелей\n\n';

    const hotelsList = hotels
        .map((hotel, index) => {
            const number = `${index + 1}.`;
            const title = hotel.title || 'Без названия';
            const telegramLink = hotel.telegram_url || 'Нет ссылки';

            return `${number} ${title}\n   Telegram: ${telegramLink}`;
        })
        .join('\n\n');

    return `${header}${hotelsList}`;
};

/**
 * Копирует текст в буфер обмена
 * @param text - текст для копирования
 * @returns Promise<boolean> - успешность операции
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Ошибка копирования:', err);
        // Fallback для старых браузеров
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            return successful;
        } catch (fallbackErr) {
            console.error('Fallback копирование не удалось:', fallbackErr);
            return false;
        }
    }
};
