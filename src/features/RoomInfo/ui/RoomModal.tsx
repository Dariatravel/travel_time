import { FormTitle } from '@/components/ui/form-title';
import { RoomInfo } from '@/features/RoomInfo/ui/RoomInfo';
import { TravelDialog } from '@/shared';
import { CurrentReserveType, Nullable } from '@/shared/api/reserve/reserve';
import { Room, RoomDTO, useCreateRoom, useDeleteRoom, useUpdateRoom } from '@/shared/api/room/room';
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
        currentReserve?.hotel?.id,
        () => {
            onClose();
            showToast('Номер успешно добавлен');
        },
        (e) => {
            showToast(`Ошибка при добавлении номера ${e}`, 'error');
        },
    );

    const { isPending: isRoomUpdating, mutateAsync: updateRoom } = useUpdateRoom(
        currentReserve?.hotel?.id,
        async () => {
            onClose();
            showToast('Информация в отеле обновлена');
        },
    );

    const { isPending: isRoomDeleting, mutateAsync: deleteRoom } = useDeleteRoom(
        currentReserve?.hotel?.id,
        async () => {
            onClose();
            showToast('Отель удалён');
        },
    );
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
        <TravelDialog
            isOpen={isOpen}
            onClose={onClose}
            title={<FormTitle>{isEdit ? 'Редактирование номера' : 'Добавление номера'}</FormTitle>}
            description={
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
            }
        />
    );
};
