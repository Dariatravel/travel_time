import { FormTitle } from '@/components/ui/form-title';
import { HotelInfo } from '@/features/HotelModal/ui/HotelInfo';
import { TravelDialog } from '@/shared';
import { useGetUsers } from '@/shared/api/auth/auth';
import {
    Hotel,
    HotelDTO,
    useCreateHotel,
    useDeleteHotel,
    useUpdateHotel,
} from '@/shared/api/hotel/hotel';
import { CurrentReserveType, Nullable } from '@/shared/api/reserve/reserve';
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
    const onDelete = async (id: string) => await deleteHotel(id);

    const isEdit = !!currentReserve?.hotel?.id;

    const { data: users } = useGetUsers();
    const loading = isLoading || isHotelLoading || isHotelUpdating || isHotelDeleting;
    return (
        <TravelDialog
            isOpen={isOpen}
            onClose={onClose}
            title={<FormTitle>{isEdit ? 'Редактирование отеля' : 'Добавление отеля'}</FormTitle>}
            description={
                <HotelInfo
                    users={users ?? []}
                    onClose={() => onClose()}
                    currentReserve={currentReserve}
                    isEdit={isEdit}
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-expect-error
                    onAccept={isEdit ? onEdit : onCreate}
                    onDelete={onDelete}
                    isLoading={loading}
                />
            }
            descriptionClassName={'max-w-lg'}
        />
    );
};
