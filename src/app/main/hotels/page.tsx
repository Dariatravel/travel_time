'use client';
import { NoDataAvailable } from '@/components/ui/empty-state';
import { HotelModal } from '@/features/HotelModal/ui/HotelModal';
import { HotelsTable } from '@/features/Hotels/ui/HotelsTable';
import { HotelDTO, useInfiniteHotelsQuery } from '@/shared/api/hotel/hotel';
import { Nullable } from '@/shared/api/reserve/reserve';
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery';
import { TravelButton } from '@/shared/ui/Button/Button';
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Hotels() {
    const router = useRouter();
    const [isHotelOpen, setIsHotelOpen] = useState(false);
    const [currentHotel, setIsCurrentHotel] = useState<Nullable<HotelDTO>>(null);

    // Используем бесконечный запрос для получения всех отелей
    const PAGE_SIZE = 100; // Увеличиваем размер для получения всех отелей сразу
    const { data, isLoading, error } = useInfiniteHotelsQuery(undefined, PAGE_SIZE, true);

    const hotels = data?.pages.flatMap((page) => page.data) ?? [];

    /**
     * Обработчик редактирования отеля
     */
    const handleEditHotel = async (hotel: HotelDTO) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const { rooms, ...rest } = hotel;
        setIsCurrentHotel(rest);
        setIsHotelOpen(true);
        await queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.hotels(),
        });
    };

    /**
     * Обработчик добавления нового отеля
     */
    const handleAddHotel = () => {
        setIsHotelOpen(true);
    };

    /**
     * Обработчик перехода к номерам отеля
     */
    const handleViewRooms = (hotel: HotelDTO) => {
        router.push(`/main/hotels/${hotel.id}`);
    };

    if (isLoading) {
        return <FullWidthLoader />;
    }

    if (!hotels.length) {
        return (
            <div>
                <NoDataAvailable
                    title="Отели пока не добавлены"
                    description="В настоящий момент не добавлено ни одного отеля"
                    actions={
                        <TravelButton label="Добавить отель" onClick={() => setIsHotelOpen(true)} />
                    }
                />

                <HotelModal
                    isOpen={isHotelOpen}
                    onClose={() => {
                        setIsCurrentHotel(null);
                        setIsHotelOpen(false);
                    }}
                    currentReserve={null}
                />
            </div>
        );
    }

    return (
        <div className="w-full p-0 mt-2">
            <HotelsTable
                hotels={hotels}
                onEdit={handleEditHotel}
                isLoading={isLoading}
                onAddHotel={handleAddHotel}
                onViewRooms={handleViewRooms}
            />

            <HotelModal
                isOpen={isHotelOpen}
                onClose={() => {
                    setIsCurrentHotel(null);
                    setIsHotelOpen(false);
                }}
                currentReserve={{ hotel: currentHotel }}
            />
        </div>
    );
}
