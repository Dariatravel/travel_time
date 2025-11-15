import { FormTitle } from '@/components/ui/form-title';
import { ReserveInfo } from '@/features/ReserveInfo/ui/ReserveInfo';
import { TravelDialog } from '@/shared';
import { CurrentReserveType, Nullable } from '@/shared/api/reserve/reserve';
import { FC } from 'react';

export interface ReserveModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAccept: (args?: unknown) => void;
    onDelete?: (id: string) => void;
    currentReserve?: Nullable<CurrentReserveType>;
    isLoading?: boolean;
}

export const ReserveModal: FC<ReserveModalProps> = ({
    isOpen = false,
    onAccept,
    onClose,
    onDelete,
    currentReserve,
    isLoading = false,
}: ReserveModalProps) => {
    return (
        <TravelDialog
            isOpen={isOpen}
            onClose={onClose}
            title={<FormTitle>Бронирование</FormTitle>}
            description={
                <ReserveInfo
                    isEdit={!!currentReserve?.reserve?.id}
                    onClose={onClose}
                    currentReserve={currentReserve}
                    onAccept={onAccept}
                    onDelete={onDelete}
                    isLoading={isLoading}
                    isOpen={isOpen}
                />
            }
        />
    );
};
