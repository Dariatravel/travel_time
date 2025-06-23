'use client';
import { HotelCalendar } from '@/features/Hotel/ui/HotelCalendar/HotelCalendar';
import { $isHotelsWithFreeRoomsLoading } from '@/features/Reservation/model/reservationStore';
import { useHotelById } from '@/shared/api/hotel/hotel';
import { Loader } from '@/shared/ui/Loader/Loader';
import { PageTitle } from '@/shared/ui/PageTitle/PageTitle';
import { useUnit } from 'effector-react/compat';
import 'my-react-calendar-timeline/style.css';
import { useParams } from 'next/navigation';
import './calendar.scss';
import cx from './page.module.css';

export default function HotelCalendarPage() {
    const params = useParams();

    const { data: hotel, isFetching } = useHotelById(params?.slug as string);
    const isFreeHotelsLoading = useUnit($isHotelsWithFreeRoomsLoading);

    if (isFetching || isFreeHotelsLoading) {
        return (
            <div className={cx.loaderContainer}>
                <Loader />
            </div>
        );
    }

    return (
        <div>
            <PageTitle title={hotel?.title} rooms={hotel?.rooms?.length ?? 0} />
            {hotel && <HotelCalendar hotel={hotel} key={hotel.id} />}
        </div>
    );
}
