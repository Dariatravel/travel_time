'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { $freeHotelsData } from '@/shared/models/freeHotels';
import { $hotelsFilter } from '@/shared/models/hotels';
import { useUnit } from 'effector-react';
import { FileText } from 'lucide-react';
import { FC, useState } from 'react';
import { ExportHotelsModal } from './ExportHotelsModal';

export const ExportHotelsButton: FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const hotelsFilter = useUnit($hotelsFilter);
    const freeHotelsData = useUnit($freeHotelsData);

    const hotels = hotelsFilter?.hotels || [];
    const hasHotels = hotels.length > 0;

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
                            disabled={!hasHotels}
                            className="h-10 w-10"
                        >
                            <FileText className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{hasHotels ? 'Экспорт списка отелей' : 'Нет отелей для экспорта'}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <ExportHotelsModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                hotels={hotels}
                freeHotelsData={freeHotelsData}
            />
        </>
    );
};
