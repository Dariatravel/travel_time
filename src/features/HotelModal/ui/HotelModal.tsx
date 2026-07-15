import { FormTitle } from '@/components/ui/form-title';
import { HotelInfo } from '@/features/HotelModal/ui/HotelInfo';
import { Loader, TravelDialog } from '@/shared';
import { useGetUsers } from '@/shared/api/auth/auth';
import {
    Hotel,
    HotelDTO,
    useCreateHotel,
    useDeleteHotel,
    useHotelById,
    useUpdateHotel,
} from '@/shared/api/hotel/hotel';
import { CurrentReserveType, Nullable } from '@/shared/api/reserve/reserve';
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery';
import { showToast } from '@/shared/ui/Toast/Toast';
import { FC } from 'react';

export interface HotelModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAccept?: (hotel?: Hotel) => void;
    currentReserve: Nullable<CurrentReserveType>;
    isLoading?: boolean;
}

export const HotelModal: FC<HotelModalProps> = ({
    isOpen = false,
    onClose,
    currentReserve = null,
    isLoading = false,
}: HotelModalProps) => {
    const { isPending: isHotelLoading, mutateAsync: createHotel } = useCreateHotel(
        () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allCounts });
            onClose();
            showToast('Отель добавлен');
        },
        (e) => {
            showToast(`Ошибка при добавлении номера ${e}`, 'error');
        },
    );
    // загрузка изображения отеля отключена в этой модалке
    const { isPending: isHotelUpdating, mutateAsync: updateHotel } = useUpdateHotel(
        currentReserve?.hotel?.id,
        async () => {
            onClose();
            showToast('Информация в отеле обновлена');
        },
    );

    const { isPending: isHotelDeleting, mutateAsync: deleteHotel } = useDeleteHotel(
        currentReserve?.hotel?.id,
        async () => {
            onClose();
            showToast('Отель удалён');
        },
    );

    const onCreate = async (hotel: Hotel) => {
        await createHotel(hotel);
    };
    const onEdit = async (hotel: HotelDTO) => {
        await updateHotel(hotel);
    };
    const onDelete = async (id: string) => {
        await deleteHotel(id);
    };

    const hotelId = currentReserve?.hotel?.id;
    const isEdit = !!hotelId;

    // Полная запись отеля из таблицы hotels. Объект отеля из календаря приходит
    // из view hotels_with_rooms_new, где нет колонок city/beach/beach_distance/
    // features/eat/is_search_visible — из-за этого «Об отеле» показывал пустые
    // поля. Дочитываем недостающее по id.
    const { data: fullHotel, isFetching: isFullHotelFetching } = useHotelById(hotelId ?? '');

    const effectiveReserve = fullHotel
        ? {
              ...currentReserve,
              hotel: { ...currentReserve?.hotel, ...fullHotel } as HotelDTO,
          }
        : currentReserve;

    // Пока тянем полную запись — показываем лоадер вместо частичной формы,
    // чтобы поля не мигали пустыми, а затем не перескакивали на заполненные.
    const isResolvingHotel = isEdit && !fullHotel && isFullHotelFetching;

    const { data: users } = useGetUsers();
    const loading = isLoading || isHotelLoading || isHotelUpdating || isHotelDeleting;
    return (
        <TravelDialog
            isOpen={isOpen}
            onClose={onClose}
            title={<FormTitle>{isEdit ? 'Редактирование отеля' : 'Добавление отеля'}</FormTitle>}
            description={
                isResolvingHotel ? (
                    <div className="flex justify-center py-10">
                        <Loader />
                    </div>
                ) : (
                    <HotelInfo
                        key={`${isEdit ? 'edit' : 'create'}-${hotelId ?? 'new'}`}
                        users={users ?? []}
                        onClose={() => onClose()}
                        currentReserve={effectiveReserve}
                        isEdit={isEdit}
                        isOpen={isOpen}
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-expect-error
                        onAccept={isEdit ? onEdit : onCreate}
                        onDelete={onDelete}
                        isLoading={loading}
                    />
                )
            }
            descriptionClassName={'max-w-lg'}
        />
    );
};
