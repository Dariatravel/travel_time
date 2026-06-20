'use client';

import { FormTitle } from '@/components/ui/form-title';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    buildRoomClosureInput,
    getRoomClosureDefaultDates,
    getRoomClosureNightCount,
    type RoomClosureFormPayload,
} from '@/shared/api/closure/roomClosure';
import {
    isValidReserveFormPeriod,
    resolveReserveDateRangeSelection,
} from '@/features/ReserveInfo/lib/reserveDateForm';
import { FormButtons, TravelDialog } from '@/shared';
import { Datepicker } from '@/shared/ui/Datepicker/Datepicker';
import { FormMessage } from '@/shared/ui/FormMessage';
import { FC, useEffect, useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import cx from './style.module.scss';

type ClosureQuickModalProps = {
    isOpen: boolean;
    roomTitle: string;
    roomId: string;
    startUnix?: number;
    endUnix?: number;
    userName?: string;
    isLoading?: boolean;
    onClose: () => void;
    onSubmit: (payload: ReturnType<typeof buildRoomClosureInput>) => void;
};

export const ClosureQuickModal: FC<ClosureQuickModalProps> = ({
    isOpen,
    roomTitle,
    roomId,
    startUnix,
    endUnix,
    userName,
    isLoading = false,
    onClose,
    onSubmit,
}) => {
    const [date, setDate] = useState<[Date, Date]>(() =>
        getRoomClosureDefaultDates(startUnix, endUnix),
    );
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setDate(getRoomClosureDefaultDates(startUnix, endUnix));
        setReason('');
        setError(null);
    }, [isOpen, startUnix, endUnix, roomId]);

    const nightCount = useMemo(() => getRoomClosureNightCount(date), [date]);

    const handleDateSelect = (range: DateRange | undefined) => {
        const nextRange = resolveReserveDateRangeSelection(range, date);
        if (nextRange) {
            setDate(nextRange);
            setError(null);
        }
    };

    const handleSubmit = () => {
        if (!isValidReserveFormPeriod(date[0], date[1])) {
            setError('Дата выезда должна быть позже даты заезда');
            return;
        }

        const payload: RoomClosureFormPayload = {
            room_id: roomId,
            date,
            reason,
            created_by: userName,
        };

        onSubmit(buildRoomClosureInput(payload, false));
    };

    return (
        <TravelDialog
            isOpen={isOpen}
            onClose={onClose}
            title={<FormTitle>Закрыть даты</FormTitle>}
            description={
                <div className={cx.form}>
                    <div className={cx.roomTitle}>Номер: {roomTitle}</div>
                    <Datepicker
                        label="Период"
                        selected={{ from: date[0], to: date[1] }}
                        onSelect={handleDateSelect}
                        numberOfMonths={1}
                        defaultMonth={date[0]}
                    />
                    <div className={cx.nightCount}>Ночей: {nightCount}</div>
                    <div>
                        <Label htmlFor="closure-reason">Комментарий (необязательно)</Label>
                        <Textarea
                            id="closure-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Ремонт, личное использование…"
                            rows={2}
                        />
                    </div>
                    {error && <FormMessage message={error} />}
                    <FormButtons
                        onClose={onClose}
                        onAccept={handleSubmit}
                        isLoading={isLoading}
                    />
                </div>
            }
        />
    );
};
