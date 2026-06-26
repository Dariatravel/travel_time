'use client';
import { HotelCalendar } from '@/features/Hotel/ui/HotelCalendar/HotelCalendar';
import { useHotelById } from '@/shared/api/hotel/hotel';
import { Loader } from '@/shared/ui/Loader/Loader';
import { PageTitle } from '@/shared/ui/PageTitle/PageTitle';
import 'my-react-calendar-timeline/style.css';
import { useParams } from 'next/navigation';
import './calendar.scss';
import cx from './page.module.css';

export default function HotelCalendarPage() {
    const params = useParams();

    const hotelId = params?.slug as string;
    const { data: hotel, isPending: isHotelPending } = useHotelById(hotelId);

    // Лоадер только при первой загрузке; фоновый refetch не размонтирует календарь
    const isInitialHotelLoading = isHotelPending && !hotel;

    if (isInitialHotelLoading) {
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
