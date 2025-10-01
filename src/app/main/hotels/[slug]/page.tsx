'use client';
import { NoDataAvailable } from '@/components/ui/empty-state';
import { RoomsTable } from '@/features/Hotels/ui/RoomsTable';
import { RoomModal } from '@/features/RoomInfo/ui/RoomModal';
import { useHotelById } from '@/shared/api/hotel/hotel';
import { Nullable } from '@/shared/api/reserve/reserve';
import { RoomDTO } from '@/shared/api/room/room';
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery';
import { TravelButton } from '@/shared/ui/Button/Button';
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import { PageTitle } from '@/shared/ui/PageTitle/PageTitle';
// Flex заменен на Tailwind CSS
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import style from './page.module.scss';

export default function Rooms() {
    const params = useParams();
    const router = useRouter();

    const [isRoomOpen, setIsRoomOpen] = useState(false);
    const [currentRoom, setIsCurrentRoom] = useState<Nullable<RoomDTO>>(null);

    const { data: hotel, isFetching } = useHotelById(params?.slug as string);

    useEffect(() => {
        return () => {
            queryClient.invalidateQueries({
                queryKey: [...QUERY_KEYS.roomsWithReservesByHotel],
            });
        };
    }, []);

    if (isFetching) {
        return <FullWidthLoader />;
    }

    const rooms: RoomDTO[] = hotel?.rooms ?? [];

    const sortedRooms = rooms.sort((a, b) => a?.title?.localeCompare(b?.title));

    const handleBackToHotels = () => {
        router.push('/main/hotels');
    };

    if (!sortedRooms?.length) {
        return (
            <div>
                <PageTitle
                    title={'Все номера'}
                    rooms={0}
                    backButtonProps={{
                        onClick: handleBackToHotels,
                    }}
                />
                <NoDataAvailable
                    title="Номер пока не добавлен"
                    description="В настоящий момент не добавлено ни одного номера"
                    actions={
                        <TravelButton label="Добавить номер" onClick={() => setIsRoomOpen(true)} />
                    }
                />
                <RoomModal
                    isOpen={isRoomOpen}
                    onClose={() => {
                        setIsCurrentRoom(null);
                        setIsRoomOpen(false);
                    }}
                    currentReserve={{ hotel: hotel }}
                />
            </div>
        );
    }

    return (
        <div className={style.container}>
            <PageTitle
                title={hotel?.title}
                rooms={sortedRooms?.length}
                backButtonProps={{
                    onClick: handleBackToHotels,
                }}
            />

            <RoomsTable
                rooms={sortedRooms}
                onEdit={(room) => {
                    setIsCurrentRoom(room);
                    setIsRoomOpen(true);
                }}
                onAddRoom={() => setIsRoomOpen(true)}
                hotelId={hotel?.id}
            />

            <RoomModal
                isOpen={isRoomOpen}
                onClose={() => {
                    setIsCurrentRoom(null);
                    setIsRoomOpen(false);
                }}
                currentReserve={{ hotel: hotel, room: currentRoom }}
            />
        </div>
    );
}
