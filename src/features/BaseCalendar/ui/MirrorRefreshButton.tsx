import { Button } from '@/components/ui/button';
import { getChessmateHotelHeaderStatus } from '@/features/Reservation/lib/chessmateHotelHeaderStatus';
import { useRefreshMirror } from '@/shared/api/mirror/mirror';
import { RefreshCw } from 'lucide-react';

/**
 * Кнопка «Обновить занятость» для голубых (зеркальных) шахматок.
 * Показывается только если у отеля статус mirror. По нажатию тянет занятость
 * из чужого календаря и обновляет внешние метки; наши брони не трогаются.
 */
export const MirrorRefreshButton = ({
    hotelId,
    hotelTitle,
}: {
    hotelId?: string;
    hotelTitle?: string | null;
}) => {
    const isMirror = getChessmateHotelHeaderStatus(hotelTitle) === 'mirror';
    const { mutate, isPending } = useRefreshMirror(hotelId);

    if (!isMirror || !hotelId) {
        return null;
    }

    return (
        <div className="flex justify-end px-2 pt-2">
            <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => mutate()}
                disabled={isPending}
                title="Подтянуть занятость из чужого календаря. Ваши брони останутся на месте."
            >
                <RefreshCw className={isPending ? 'animate-spin' : ''} />
                {isPending ? 'Обновляю…' : 'Обновить занятость'}
            </Button>
        </div>
    );
};
