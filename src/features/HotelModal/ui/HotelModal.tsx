import { Dialog, DialogContent, DialogDescription, DialogHeader } from '@/components/ui/dialog';
import { FormTitle } from '@/components/ui/form-title';
import { HotelInfo } from '@/features/HotelModal/ui/HotelInfo';
import { useGetUsers } from '@/shared/api/auth/auth';
import {
    Hotel,
    HotelDTO,
    useCreateHotel,
    useCreateImage,
    useDeleteHotel,
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
    onAccept,
    onClose,
    currentReserve = null,
    isLoading = false,
}: HotelModalProps) => {
    const {
        isError: isHotelError,
        isPending: isHotelLoading,
        mutateAsync: createHotel,
    } = useCreateHotel(
        () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotels });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotelsForRoom });
            onClose();

            showToast('Отель добавлен');
        },
        (e) => {
            showToast(`Ошибка при добавлении номера ${e}`, 'error');
        },
    );
    const {
        isError: isHotelImageError,
        isPending: isHotelImageCreating,
        mutateAsync: createImage,
    } = useCreateImage(
        () => {
            showToast('Отель добавлен');
        },
        (e) => {
            showToast(`Ошибка при добавлении номера ${e}`, 'error');
        },
    );
    const { isPending: isHotelUpdating, mutateAsync: updateHotel } = useUpdateHotel(() => {
        queryClient.invalidateQueries({
            queryKey: [...QUERY_KEYS.hotels],
        });
        onClose();
        showToast('Информация в отели обновлена');
    });

    const { isPending: isHotelDeleting, mutateAsync: deleteHotel } = useDeleteHotel(() => {
        queryClient.invalidateQueries({
            queryKey: [...QUERY_KEYS.hotels],
        });
        onClose();
        showToast('Отель удалён');
    });

    const onCreate = async (hotel: Hotel) => {
        if (hotel?.image_id) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            const { id, file } = hotel?.image_id;
            await createImage(id, file);
        }

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const hotelTmp = { ...hotel, image_id: hotel?.image_id?.id };
        await createHotel(hotelTmp);
    };
    const onEdit = async (hotel: HotelDTO) => {
        if (hotel?.image_id) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            const { id, file } = hotel?.image_id;
            await createImage(id, file);
        }

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const hotelTmp = { ...hotel, image_id: hotel?.image_id?.id };
        await updateHotel(hotel);
    };
    const onDelete = async (id: string) => await deleteHotel(id);

    const isEdit = !!currentReserve?.hotel?.id;

    const { data: users, isFetching: isUsersLoading } = useGetUsers();
    const loading = isLoading || isHotelLoading || isHotelUpdating || isHotelDeleting;
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            {/* <DialogTrigger asChild>
                <Button variant="outline" className="cursor-pointer">
                    Добавить отель
                </Button>
            </DialogTrigger> */}
            <DialogContent className="md:max-w-2xl max-h-[88vh] min-h-[88vh] overflow-y-auto p-y-3 px-6">
                <DialogHeader>
                    <FormTitle>{isEdit ? 'Редактирование отеля' : 'Добавление отеля'}</FormTitle>
                </DialogHeader>
                <DialogDescription>
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
                </DialogDescription>
            </DialogContent>
        </Dialog>
    );
};
