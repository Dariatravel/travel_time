import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { FormTitle } from '@/components/ui/form-title';
import { HotelInfo } from '@/features/HotelModal/ui/HotelInfo';
import { useGetUsers } from '@/shared/api/auth/auth';
import {
    Hotel,
    HotelDTO,
    useCreateHotel,
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
    onClose,
    currentReserve = null,
    isLoading = false,
}: HotelModalProps) => {
    const { isPending: isHotelLoading, mutateAsync: createHotel } = useCreateHotel(
        async () => {
            await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotels });
            await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotelsForRoom });
            await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotelById });
            await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.roomsWithReservesByHotel });
            onClose();

            showToast('Отель добавлен');
        },
        (e) => {
            showToast(`Ошибка при добавлении номера ${e}`, 'error');
        },
    );
    // загрузка изображения отеля отключена в этой модалке
    const { isPending: isHotelUpdating, mutateAsync: updateHotel } = useUpdateHotel(async () => {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotels });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotelsForRoom });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotelById });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.roomsWithReservesByHotel });
        onClose();
        showToast('Информация в отеле обновлена');
    });

    const { isPending: isHotelDeleting, mutateAsync: deleteHotel } = useDeleteHotel(async () => {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotels });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotelsForRoom });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotelById });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.roomsWithReservesByHotel });
        onClose();
        showToast('Отель удалён');
    });

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
        <Dialog open={isOpen} onOpenChange={onClose}>
            {/* <DialogTrigger asChild>
                <Button variant="outline" className="cursor-pointer">
                    Добавить отель
                </Button>
            </DialogTrigger> */}
            <DialogContent className="max-h-[90vh] overflow-y-auto rounded-xl px-3 py-4 sm:w-auto sm:max-w-2xl sm:px-6 sm:py-5">
                <DialogHeader>
                    <DialogTitle>
                        <FormTitle>
                            {isEdit ? 'Редактирование отеля' : 'Добавление отеля'}
                        </FormTitle>
                    </DialogTitle>
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
