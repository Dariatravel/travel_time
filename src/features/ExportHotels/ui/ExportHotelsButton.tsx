'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AdvancedFiltersModel } from '@/features/AdvancedFilters';
import {
    getAllHotelsForExport,
    HotelForRoom,
    HotelRoomsReservesDTO,
} from '@/shared/api/hotel/hotel';
import { $freeHotelsData } from '@/shared/models/freeHotels';
import { $hotelsFilter } from '@/shared/models/hotels';
import { showToast } from '@/shared/ui/Toast/Toast';
import { useUnit } from 'effector-react';
import { FileText, Loader2 } from 'lucide-react';
import { FC, useMemo, useState } from 'react';
import { ExportHotelsModal } from './ExportHotelsModal';

export const ExportHotelsButton: FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [exportHotels, setExportHotels] = useState<HotelForRoom[]>([]);
    const hotelsFilter = useUnit($hotelsFilter);
    const freeHotelsData = useUnit($freeHotelsData);
    const advancedFilters = useUnit(AdvancedFiltersModel.$filters);

    // Проверяем наличие активных фильтров
    const hasActiveFilters = useMemo(() => {
        // Проверяем обычные фильтры
        const hasBasicFilters =
            hotelsFilter?.type !== undefined ||
            hotelsFilter?.quantity !== undefined ||
            hotelsFilter?.start !== undefined ||
            hotelsFilter?.end !== undefined ||
            hotelsFilter?.roomFeatures !== undefined ||
            (hotelsFilter?.hotels && hotelsFilter.hotels.length > 0) ||
            (hotelsFilter?.freeHotels_id && hotelsFilter.freeHotels_id.length > 0);

        // Проверяем расширенные фильтры
        const hasAdvancedFilters = Object.values(advancedFilters).some((section) =>
            section.options.some((option: { isActive: boolean }) => option.isActive),
        );

        return hasBasicFilters || hasAdvancedFilters;
    }, [hotelsFilter, advancedFilters]);

    // Обработчик клика на кнопку экспорта
    const handleExportClick = async () => {
        if (!hasActiveFilters) {
            showToast('Нет данных для экспорта', 'error');
            return;
        }

        setIsLoading(true);
        try {
            // Загружаем все отели для экспорта
            const allHotels: HotelRoomsReservesDTO[] = await getAllHotelsForExport(hotelsFilter);

            // Фильтруем только отели с номерами
            const hotelsWithRooms = allHotels.filter((hotel) => hotel?.rooms?.length > 0);

            // Если есть freeHotelsData, фильтруем только отели из freeHotelsData
            let filteredHotels = hotelsWithRooms;
            if (freeHotelsData && freeHotelsData.length > 0) {
                const freeHotelIds = new Set(freeHotelsData.map((fh) => fh.hotel_id));
                filteredHotels = hotelsWithRooms.filter((hotel) => freeHotelIds.has(hotel.id));
            }

            // Преобразуем HotelRoomsReservesDTO в HotelForRoom для экспорта
            const hotels: HotelForRoom[] = filteredHotels.map((hotel) => ({
                id: hotel.id,
                title: hotel.title,
                phone: hotel.phone || '',
                address: hotel.address || '',
                telegram_url: hotel.telegram_url,
                rooms_count: hotel?.rooms?.length || 0,
            }));

            setExportHotels(hotels);

            if (hotels.length === 0) {
                showToast('Нет отелей для экспорта', 'error');
                setIsLoading(false);
                return;
            }

            // Открываем модальное окно
            setIsModalOpen(true);
        } catch (error) {
            console.error('Ошибка при загрузке отелей для экспорта:', error);
            showToast('Не удалось загрузить отели для экспорта', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleExportClick}
                            disabled={!hasActiveFilters || isLoading}
                            className="h-10 w-10"
                        >
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <FileText className="h-4 w-4" />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>
                            {isLoading
                                ? 'Загрузка данных...'
                                : hasActiveFilters
                                  ? 'Экспорт списка отелей'
                                  : 'Нет отелей для экспорта'}
                        </p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <ExportHotelsModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                hotels={exportHotels}
                freeHotelsData={freeHotelsData}
            />
        </>
    );
};
