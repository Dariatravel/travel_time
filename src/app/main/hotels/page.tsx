'use client';
import { Hotel } from '@/features/Hotel/Hotel';
import { HotelModal } from '@/features/HotelModal/ui/HotelModal';
import { HotelDTO, HotelWithRoomsCount, useDeleteHotel, useGetAllHotels, useUpdateHotel } from '@/shared/api/hotel/hotel';
import { Nullable } from '@/shared/api/reserve/reserve';
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery';
import { TravelButton } from '@/shared/ui/Button/Button';
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import { PageTitle } from '@/shared/ui/PageTitle/PageTitle';
import { ResponsesNothingFound } from '@consta/uikit/ResponsesNothingFound';
import { Flex } from 'antd';
import { useState } from 'react';
import style from './page.module.css';

export default function Hotels() {
    const { isFetching, error, data: hotels, refetch } = useGetAllHotels();
    const [isHotelOpen, setIsHotelOpen] = useState(false);
    const [currentHotel, setIsCurrentHotel] = useState<Nullable<HotelDTO>>(null);

    const { isPending: isHotelDeleting, mutateAsync: deleteHotel } = useDeleteHotel(() => {
        queryClient.invalidateQueries({
            queryKey: [...QUERY_KEYS.hotels],
        });
    });

    const { isPending: isHotelUpdating, mutateAsync: updateHotel } = useUpdateHotel(() => {
        queryClient.invalidateQueries({
            queryKey: [...QUERY_KEYS.hotels],
        });
    });
    const isLoading = isHotelDeleting || isFetching || isHotelUpdating;

    if (isFetching) {
        return <FullWidthLoader />;
    }

    if (!hotels?.length) {
        return (
            <div>
                <PageTitle title={'Все отели'} hotels={0} rooms={0} />
                <ResponsesNothingFound
                    title={'Отели пока не добавлены'}
                    description={'В настоящий момент не добавлено ни одного отеля'}
                    actions={<TravelButton label={'Добавить отель'} onClick={() => setIsHotelOpen(true)} />}
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

    const totalCount = {
        hotels: hotels?.length,
        rooms: hotels?.reduce((prev, curr) => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            return (prev += curr?.rooms?.length ?? 0);
        }, 0),
    };

    return (
        <div className={style.container}>
            {isLoading && <FullWidthLoader />}

            <PageTitle
                title={'Все отели'}
                hotels={totalCount?.hotels}
                rooms={totalCount?.rooms}
                buttonProps={{
                    label: 'Добавить отель',
                    onClick: () => setIsHotelOpen(true),
                }}
            />
            <Flex wrap gap={'small'}>
                {hotels?.map((hotel) => (
                    <Hotel
                        hotel={hotel as HotelWithRoomsCount}
                        key={hotel.id}
                        onDelete={deleteHotel}
                        onEdit={(hotel: HotelDTO) => {
                            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                            // @ts-expect-error
                            const { rooms, ...rest } = hotel;

                            setIsCurrentHotel(rest);
                            setIsHotelOpen(true);
                        }}
                    />
                ))}
            </Flex>

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
