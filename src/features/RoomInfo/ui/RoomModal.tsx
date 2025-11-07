import { Dialog, DialogContent } from '@/components/ui/dialog';
import { RoomInfo } from '@/features/RoomInfo/ui/RoomInfo';
import { CurrentReserveType, Nullable } from '@/shared/api/reserve/reserve';
import { Room, RoomDTO, useCreateRoom, useDeleteRoom, useUpdateRoom } from '@/shared/api/room/room';
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery';
import { devLog } from '@/shared/lib/logger';
import { showToast } from '@/shared/ui/Toast/Toast';
import { FC, useCallback } from 'react';
export interface RoomModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAccept?: (args?: unknown) => void;
    currentReserve: Nullable<CurrentReserveType>;
    isLoading?: boolean;
}

export const RoomModal: FC<RoomModalProps> = ({
    isOpen = false,
    onClose,
    currentReserve,
    isLoading = false,
}: RoomModalProps) => {
    const { isPending: isRoomCreating, mutate: createRoom } = useCreateRoom(
        () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotels });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.roomsByHotel });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotelById });
            queryClient.invalidateQueries({
                queryKey: [...QUERY_KEYS.roomsWithReservesByHotel],
            });
            onClose();
            showToast('Номер успешно добавлен');
        },
        (e) => {
            showToast(`Ошибка при добавлении номера ${e}`, 'error');
        },
    );

    const { isPending: isRoomUpdating, mutateAsync: updateRoom } = useUpdateRoom(async () => {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotelById });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotels });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.roomsWithReservesByHotel });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.roomsByHotel });
        onClose();
        showToast('Информация в отеле обновлена');
    });

    const { isPending: isRoomDeleting, mutateAsync: deleteRoom } = useDeleteRoom(async () => {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotelById });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hotels });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.roomsWithReservesByHotel });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.roomsByHotel });
        onClose();
        showToast('Отель удалён');
    });
    const onCreate = useCallback(
        async (room: Room) => {
            await createRoom(room);
            devLog('Создаю ROOM', room);
        },
        [createRoom],
    );
    const onEdit = async (room: RoomDTO) => await updateRoom(room);
    const onDelete = async (id: string) => await deleteRoom(id);

    const loading = isLoading || isRoomCreating || isRoomUpdating || isRoomDeleting;

    const isEdit = !!currentReserve?.room?.id;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto rounded-2xl px-4 py-4 sm:w-auto sm:max-w-4xl sm:px-6 sm:py-5">
                <RoomInfo
                    onClose={onClose}
                    currentReserve={currentReserve}
                    onAccept={
                        isEdit
                            ? (args: unknown) => onEdit(args as RoomDTO)
                            : (args: unknown) => onCreate(args as RoomDTO)
                    }
                    onDelete={onDelete}
                    isLoading={loading}
                    isEdit={isEdit}
                />
            </DialogContent>
        </Dialog>
    );
};
