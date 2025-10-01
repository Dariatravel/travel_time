import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ReserveInfo } from '@/features/ReserveInfo/ui/ReserveInfo';
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
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="min-w-[600px]  max-h-[90vh] overflow-y-auto">
                <ReserveInfo
                    isEdit={!!currentReserve?.reserve?.id}
                    onClose={onClose}
                    currentReserve={currentReserve}
                    onAccept={onAccept}
                    onDelete={onDelete}
                    isLoading={isLoading}
                />
            </DialogContent>
        </Dialog>
    );
};
