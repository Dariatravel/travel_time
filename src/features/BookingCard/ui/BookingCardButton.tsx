'use client';

import { Button } from '@/components/ui/button';
import type { CurrentReserveType } from '@/shared/api/reserve/reserve';
import { isBookingCardEnabled } from '@/shared/config/featureFlags';
import { $user } from '@/shared/models/auth';
import { useUnit } from 'effector-react/compat';
import { ClipboardList } from 'lucide-react';
import { FC, useState } from 'react';

import { BookingCardModal } from './BookingCardModal';

/**
 * Кнопка «Карточка брони» в форме существующей брони. Видна только тем,
 * кому функция открыта (см. featureFlags.ts); для всех остальных — ничего.
 */
export const BookingCardButton: FC<{ currentReserve?: CurrentReserveType | null }> = ({
    currentReserve,
}) => {
    const user = useUnit($user);
    const [isOpen, setIsOpen] = useState(false);

    if (!currentReserve?.reserve?.id || !currentReserve.hotel || !isBookingCardEnabled(user?.role)) {
        return null;
    }

    return (
        <>
            <Button type="button" variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
                <ClipboardList className="size-4" />
                Карточка брони: ваучер, чат, отельер
            </Button>
            {isOpen && (
                <BookingCardModal
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    currentReserve={currentReserve}
                />
            )}
        </>
    );
};
