import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTrigger,
} from '@/components/ui/dialog';
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
import { FormTitle } from '@/shared/ui/FormTitle/FormTitle';
import { showToast } from '@/shared/ui/Toast/Toast';
import { FC } from 'react';

export interface ReserveModalProps {
    isOpen: boolean;
    onHandleOpen: (state: boolean) => void;
    onAccept?: (hotel?: Hotel) => void;
    currentReserve: Nullable<CurrentReserveType>;
    isLoading?: boolean;
}

export const HotelModal: FC<ReserveModalProps> = ({
    isOpen = false,
    onAccept,
    onHandleOpen,
    currentReserve = null,
    isLoading = false,
}: ReserveModalProps) => {
    const {
        isError: isHotelError,
        isPending: isHotelLoading,
        mutateAsync: createHotel,
    } = useCreateHotel(
        () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotels });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotelsForRoom });
            onHandleOpen(false);

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
        onHandleOpen(false);
        showToast('Информация в отели обновлена');
    });

    const { isPending: isHotelDeleting, mutateAsync: deleteHotel } = useDeleteHotel(() => {
        queryClient.invalidateQueries({
            queryKey: [...QUERY_KEYS.hotels],
        });
        onHandleOpen(false);
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
        <Dialog open={isOpen} onOpenChange={onHandleOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="cursor-pointer">
                    Добавить отель
                </Button>
            </DialogTrigger>
            <DialogContent className="md:max-w-2xl max-h-[80vh] min-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <FormTitle>{isEdit ? 'Редактирование отеля' : 'Добавление отеля'}</FormTitle>
                </DialogHeader>
                <DialogDescription>
                    <HotelInfo
                        users={users ?? []}
                        onClose={() => onHandleOpen(false)}
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
