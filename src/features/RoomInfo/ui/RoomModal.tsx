import { RoomInfo } from '@/features/RoomInfo/ui/RoomInfo';
import { CurrentReserveType, Nullable } from '@/shared/api/reserve/reserve';
import { Room, RoomDTO, useCreateRoom, useDeleteRoom, useUpdateRoom } from '@/shared/api/room/room';
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery';
import { devLog } from '@/shared/lib/logger';
import { Modal } from '@/shared/ui/Modal/Modal';
import { showToast } from '@/shared/ui/Toast/Toast';
import { FC, useCallback } from 'react';
export interface RoomModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAccept?: (args?: any) => void;
    currentReserve: Nullable<CurrentReserveType>;
    isLoading?: boolean;
}

export const RoomModal: FC<RoomModalProps> = ({ isOpen = false, onClose, currentReserve, isLoading = false }: RoomModalProps) => {
    const {
        isPending: isRoomCreating,
        mutate: createRoom,
        error: roomError,
    } = useCreateRoom(
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

    const { isPending: isRoomUpdating, mutateAsync: updateRoom } = useUpdateRoom(() => {
        queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.hotelById,
        });
        onClose();
        showToast('Информация в отели обновлена');
    });

    const { isPending: isRoomDeleting, mutateAsync: deleteRoom } = useDeleteRoom(() => {
        queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.hotelById,
        });
        onClose();
        showToast('Отель удалён');
    });
    const onCreate = useCallback(async (room: Room) => {
        await createRoom(room);
        devLog('Создаю ROOM', room);
    }, []);
    const onEdit = async (room: RoomDTO) => await updateRoom(room);
    const onDelete = async (id: string) => await deleteRoom(id);

    const loading = isLoading || isRoomCreating || isRoomUpdating || isRoomDeleting;

    const isEdit = !!currentReserve?.room?.id;

    return (
        <Modal hasOverlay isOpen={isOpen} onEsc={onClose} loading={loading} onClose={onClose}>
            <RoomInfo onClose={onClose} currentReserve={currentReserve} onAccept={isEdit ? onEdit : onCreate} onDelete={onDelete} isLoading={loading} isEdit={isEdit} />
        </Modal>
    );
};
