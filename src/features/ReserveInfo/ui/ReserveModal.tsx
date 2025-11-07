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
            <DialogContent className="w-[calc(100vw-2rem)] max-h-[93vh]  min-h-[93vh] md:max-h-[93vh] md:min-h-auto  overflow-y-auto rounded-2xl px-4 py-4 sm:w-auto sm:max-w-4xl sm:px-6 sm:py-5">
                <ReserveInfo
                    isEdit={!!currentReserve?.reserve?.id}
                    onClose={onClose}
                    currentReserve={currentReserve}
                    onAccept={onAccept}
                    onDelete={onDelete}
                    isLoading={isLoading}
                    isOpen={isOpen}
                />
            </DialogContent>
        </Dialog>
    );
};
