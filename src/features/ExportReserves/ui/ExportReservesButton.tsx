'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ExportReservesModal } from '@/features/ExportReserves/ui/ExportReservesModal';
import { $hotelsFilter } from '@/shared/models/hotels';
import { useUnit } from 'effector-react';
import { FileSpreadsheet } from 'lucide-react';
import { FC, useState } from 'react';

export const ExportReservesButton: FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const hotelsFilter = useUnit($hotelsFilter);

    return (
        <>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setIsModalOpen(true)}
                            className="h-10 w-10"
                        >
                            <FileSpreadsheet className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Выгрузка броней в Excel</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <ExportReservesModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                hotelsFilter={hotelsFilter}
            />
        </>
    );
};
