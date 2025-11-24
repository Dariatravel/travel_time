'use client';
import { HotelModal } from '@/features/HotelModal/ui/HotelModal';
import { HotelInfoCard, ReservationInfoCard, RoomInfoCard } from '@/features/Main';
import { ReserveModal } from '@/features/ReserveInfo/ui/ReserveModal';
import { RoomModal } from '@/features/RoomInfo/ui/RoomModal';
import { cn } from '@/lib/utils';
import { Loader } from '@/shared';
import { useGetSession } from '@/shared/api/auth/auth';
import { useGetAllCounts } from '@/shared/api/hotel/hotel';
import { Reserve, useCreateReserve } from '@/shared/api/reserve/reserve';
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery';
import { devLog } from '@/shared/lib/logger';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { showToast } from '@/shared/ui/Toast/Toast';
import { Building2, Calendar, Key } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ToastContainer } from 'react-toastify';

export default function Main() {
    const [isHotelOpen, setIsHotelOpen] = useState<boolean>(false);
    const [isRoomOpen, setIsRoomOpen] = useState<boolean>(false);
    const [isReserveOpen, setIsReserveOpen] = useState<boolean>(false);
    const { data: countsData, isFetching: isCountsLoading } = useGetAllCounts();
    const { data: sessionData } = useGetSession();

    const { isMobile } = useScreenSize();

    useEffect(() => {
        if (sessionData?.session?.access_token) {
            devLog('Access token:', sessionData.session);
        }
    }, [sessionData]);

    const { isPending: isReserveLoading, mutate: createReserve } = useCreateReserve(
        undefined, // hotelId
        undefined, // roomId
        () => {
            queryClient.invalidateQueries({ queryKey: ['hotels', 'list'] });
            setIsReserveOpen(false);
            showToast('Бронь успешно добавлена');
        },
        (e) => {
            showToast(`Ошибка при добавлении брони ${e}`, 'error');
        },
    );

    // Массив cards заменен на новые InfoCard компоненты

    const onReserveCreate = useCallback((reserve: Reserve) => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allCounts });
        devLog('создаю Reserve', reserve);
        createReserve(reserve);
    }, []);

    if (isCountsLoading)
        return (
            <div className="flex justify-center items-center h-full min-h-[calc(100vh-100px)]">
                <Loader />
            </div>
        );

    return (
        <div>
            {/* Модальные окна для каждой карточки */}
            <HotelModal
                isOpen={isHotelOpen}
                onClose={() => setIsHotelOpen(false)}
                currentReserve={null}
            />
            <RoomModal
                isOpen={isRoomOpen}
                onClose={() => setIsRoomOpen(false)}
                currentReserve={null}
            />
            <ReserveModal
                isOpen={isReserveOpen}
                onClose={() => setIsReserveOpen(false)}
                onAccept={(reserve) => onReserveCreate(reserve as Reserve)}
                currentReserve={null}
                isLoading={isReserveLoading}
            />

            <div
                className={cn(
                    'grid gap-6 max-w-6xl mx-auto mt-4',
                    isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
                )}
            >
                <HotelInfoCard
                    title="Отели"
                    count={countsData?.[0]?.hotel_count || 0}
                    icon={<Building2 className="w-full h-full" />}
                    button={{
                        title: 'Добавить отель',
                        onClick: () => setIsHotelOpen(true),
                    }}
                    showGrowth
                    growthPercent={12}
                />

                <RoomInfoCard
                    title="Номера"
                    count={countsData?.[0]?.room_count || 0}
                    icon={<Key className="w-full h-full" />}
                    button={{
                        title: 'Добавить номер',
                        onClick: () => setIsRoomOpen(true),
                    }}
                    showGrowth
                    growthPercent={8}
                />

                <ReservationInfoCard
                    title="Бронирования"
                    count={countsData?.[0]?.reserve_count || 0}
                    icon={<Calendar className="w-full h-full" />}
                    button={{
                        title: 'Новое бронирование',
                        onClick: () => setIsReserveOpen(true),
                    }}
                    showGrowth
                    growthPercent={-3}
                />
            </div>
            <ToastContainer />
        </div>
    );
}
