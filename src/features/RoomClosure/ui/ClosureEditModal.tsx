'use client';

import { FormTitle } from '@/components/ui/form-title';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    buildRoomClosureInput,
    getRoomClosureDefaultDates,
    getRoomClosureNightCount,
    type RoomClosureDTO,
} from '@/shared/api/closure/roomClosure';
import { formatClosurePeriod } from '@/features/BaseCalendar/lib/timelineBlocks';
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

type ClosureEditModalProps = {
    isOpen: boolean;
    closure: RoomClosureDTO | null;
    roomTitle?: string;
    userName?: string;
    isLoading?: boolean;
    isDeleting?: boolean;
    onClose: () => void;
    onSubmit: (payload: RoomClosureDTO) => void;
    onDelete: (id: string) => void;
};

export const ClosureEditModal: FC<ClosureEditModalProps> = ({
    isOpen,
    closure,
    roomTitle,
    userName,
    isLoading = false,
    isDeleting = false,
    onClose,
    onSubmit,
    onDelete,
}) => {
    const [date, setDate] = useState<[Date, Date]>([new Date(), new Date()]);
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !closure) {
            return;
        }

        setDate(getRoomClosureDefaultDates(closure.start, closure.end));
        setReason(closure.reason ?? '');
        setError(null);
    }, [isOpen, closure]);

    const nightCount = useMemo(() => getRoomClosureNightCount(date), [date]);
    const periodLabel = closure
        ? formatClosurePeriod(closure.start, closure.end)
        : '';

    const handleDateSelect = (range: DateRange | undefined) => {
        const nextRange = resolveReserveDateRangeSelection(range, date);
        if (nextRange) {
            setDate(nextRange);
            setError(null);
        }
    };

    const handleSubmit = () => {
        if (!closure) {
            return;
        }

        if (!isValidReserveFormPeriod(date[0], date[1])) {
            setError('Дата выезда должна быть позже даты заезда');
            return;
        }

        const input = buildRoomClosureInput(
            {
                room_id: closure.room_id,
                date,
                reason,
                edited_by: userName,
            },
            true,
        );

        onSubmit({
            ...closure,
            ...input,
        });
    };

    if (!closure) {
        return null;
    }

    return (
        <TravelDialog
            isOpen={isOpen}
            onClose={onClose}
            title={<FormTitle>Закрытие дат</FormTitle>}
            description={
                <div className={cx.form}>
                    {roomTitle && <div className={cx.roomTitle}>Номер: {roomTitle}</div>}
                    <div className={cx.nightCount}>Текущий период: {periodLabel}</div>
                    <Datepicker
                        label="Новый период"
                        selected={{ from: date[0], to: date[1] }}
                        onSelect={handleDateSelect}
                        numberOfMonths={1}
                        defaultMonth={date[0]}
                    />
                    <div className={cx.nightCount}>Ночей: {nightCount}</div>
                    <div>
                        <Label htmlFor="closure-edit-reason">Комментарий</Label>
                        <Textarea
                            id="closure-edit-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Комментарий к закрытию"
                            rows={2}
                        />
                    </div>
                    {error && <FormMessage message={error} />}
                    <FormButtons
                        onClose={onClose}
                        onAccept={handleSubmit}
                        isLoading={isLoading || isDeleting}
                        isEdit
                        deleteText="Снять закрытие"
                        onDelete={() => onDelete(closure.id)}
                    />
                </div>
            }
        />
    );
};
