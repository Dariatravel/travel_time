'use client';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { FreeHotelsDTO, HotelForRoom } from '@/shared/api/hotel/hotel';
import { showToast } from '@/shared/ui/Toast/Toast';
import { Check, Copy } from 'lucide-react';
import { FC, useEffect, useMemo, useState } from 'react';
import { copyToClipboard } from '../lib/formatHotels';
import { formatHotelsWithAvailability } from '../lib/formatHotelsWithAvailability';

export interface ExportHotelsModalProps {
    isOpen: boolean;
    onClose: () => void;
    hotels: HotelForRoom[];
    freeHotelsData?: FreeHotelsDTO[];
}

export const ExportHotelsModal: FC<ExportHotelsModalProps> = ({
    isOpen,
    onClose,
    hotels,
    freeHotelsData,
}: ExportHotelsModalProps) => {
    const [copied, setCopied] = useState(false);

    // Мемоизация форматированного текста
    const formattedText = useMemo(
        () => formatHotelsWithAvailability(hotels, freeHotelsData),
        [hotels, freeHotelsData],
    );

    // Предвычисление Map для быстрого поиска
    const freeHotelsMap = useMemo(() => {
        const map = new Map<string, FreeHotelsDTO>();
        freeHotelsData?.forEach((fh) => map.set(fh.hotel_id, fh));
        return map;
    }, [freeHotelsData]);

    // Автоматическое копирование при открытии
    useEffect(() => {
        if (isOpen && hotels.length > 0) {
            handleCopy();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleCopy = async () => {
        const success = await copyToClipboard(formattedText);
        if (success) {
            setCopied(true);
            showToast('Список отелей скопирован в буфер обмена', 'success');
            setTimeout(() => setCopied(false), 2000);
        } else {
            showToast('Не удалось скопировать', 'error');
        }
    };

    if (hotels.length === 0) {
        return (
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Экспорт списка отелей</DialogTitle>
                        <DialogDescription>
                            Нет доступных отелей для экспорта. Пожалуйста, выполните поиск.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end">
                        <Button onClick={onClose} variant="outline">
                            Закрыть
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Экспорт списка отелей</DialogTitle>
                    <DialogDescription>
                        Список отелей для отправки в Telegram/WhatsApp (автоматически скопирован)
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-auto">
                    <div className="rounded-md border">
                        <div className="p-4 bg-gray-50">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">
                                            №
                                        </th>
                                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">
                                            Название отеля
                                        </th>
                                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">
                                            Telegram
                                        </th>
                                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">
                                            Свободных номеров
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {hotels.map((hotel, index) => {
                                        const freeHotel = freeHotelsMap.get(hotel.id);
                                        return (
                                            <tr key={hotel.id} className="border-b last:border-0">
                                                <td className="py-3 px-3 text-sm text-gray-600">
                                                    {index + 1}
                                                </td>
                                                <td className="py-3 px-3 text-sm font-medium">
                                                    {hotel.title || 'Без названия'}
                                                </td>
                                                <td className="py-3 px-3 text-sm">
                                                    {(hotel as any).telegram_url ? (
                                                        <a
                                                            href={(hotel as any).telegram_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 hover:underline"
                                                        >
                                                            Открыть
                                                        </a>
                                                    ) : (
                                                        <span className="text-gray-400">
                                                            Нет ссылки
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-3 text-sm">
                                                    {freeHotel ? (
                                                        <span className="text-green-600 font-medium">
                                                            ✅ {freeHotel.free_room_count}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="mt-4 p-3 bg-gray-100 rounded-md">
                        <p className="text-xs text-gray-600 mb-2 font-medium">
                            Предпросмотр для копирования:
                        </p>
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-white p-3 rounded border">
                            {formattedText}
                        </pre>
                    </div>
                </div>

                <div className="flex justify-between gap-2 pt-4 border-t">
                    <Button onClick={onClose} variant="outline">
                        Закрыть
                    </Button>
                    <Button onClick={handleCopy} disabled={copied}>
                        {copied ? (
                            <>
                                <Check className="mr-2 h-4 w-4" />
                                Скопировано
                            </>
                        ) : (
                            <>
                                <Copy className="mr-2 h-4 w-4" />
                                Копировать снова
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
