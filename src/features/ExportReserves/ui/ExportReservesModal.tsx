'use client';

import { Button } from '@/components/ui/button';
import { downloadReservesExcel } from '@/features/ExportReserves/lib/downloadReservesExcel';
import { TravelDialog } from '@/shared';
import { getReservesForExport } from '@/shared/api/reserve/getReservesForExport';
import { TravelFilterType } from '@/shared/models/hotels';
import { Datepicker } from '@/shared/ui/Datepicker/Datepicker';
import { showToast } from '@/shared/ui/Toast/Toast';
import dayjs from 'dayjs';
import { Loader2 } from 'lucide-react';
import { FC, useEffect, useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';

export interface ExportReservesModalProps {
    isOpen: boolean;
    onClose: () => void;
    hotelsFilter?: TravelFilterType;
}

const getDefaultPeriod = (filter?: TravelFilterType): DateRange => {
    if (filter?.start && filter?.end) {
        return {
            from: dayjs.unix(filter.start).startOf('day').toDate(),
            to: dayjs.unix(filter.end).startOf('day').toDate(),
        };
    }

    return {
        from: dayjs().startOf('day').toDate(),
        to: dayjs().add(1, 'month').startOf('day').toDate(),
    };
};

const getOptionalHotelIds = (filter?: TravelFilterType) => {
    if (filter?.hotels?.length) {
        return filter.hotels.map((hotel) => hotel.id);
    }

    return undefined;
};

export const ExportReservesModal: FC<ExportReservesModalProps> = ({
    isOpen,
    onClose,
    hotelsFilter,
}) => {
    const [period, setPeriod] = useState<DateRange | undefined>(() => getDefaultPeriod(hotelsFilter));
    const [isExporting, setIsExporting] = useState(false);

    const hotelIds = useMemo(() => getOptionalHotelIds(hotelsFilter), [hotelsFilter]);

    useEffect(() => {
        if (isOpen) {
            setPeriod(getDefaultPeriod(hotelsFilter));
        }
    }, [hotelsFilter, isOpen]);

    const handleExport = async () => {
        if (!period?.from || !period?.to) {
            showToast('Выберите период выгрузки', 'error');
            return;
        }

        if (dayjs(period.from).startOf('day').isAfter(dayjs(period.to).startOf('day'))) {
            showToast('Дата начала периода должна быть не позже даты окончания', 'error');
            return;
        }

        setIsExporting(true);

        try {
            const rows = await getReservesForExport({
                periodStart: period.from,
                periodEnd: period.to,
                hotelIds,
            });

            if (rows.length === 0) {
                showToast('За выбранный период брони не найдены', 'error');
                return;
            }

            const periodLabel = `${dayjs(period.from).format('YYYY-MM-DD')}_${dayjs(period.to).format('YYYY-MM-DD')}`;
            downloadReservesExcel(rows, periodLabel);
            showToast(`Выгружено броней: ${rows.length}`, 'success');
            onClose();
        } catch (error) {
            console.error('Reserve export failed:', error);
            showToast(
                error instanceof Error ? error.message : 'Не удалось выгрузить брони',
                'error',
            );
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <TravelDialog
            isOpen={isOpen}
            onClose={onClose}
            title="Выгрузка броней в Excel"
            description={
                <div className="space-y-4 px-1">
                    <p className="text-sm text-muted-foreground">
                        В файл попадут все брони, которые пересекаются с выбранным периодом.
                        Выгружаются только отели и номера, доступные вашему аккаунту.
                    </p>
                    <Datepicker
                        selected={period}
                        onSelect={setPeriod}
                        label="Период выгрузки"
                        numberOfMonths={2}
                        defaultMonth={period?.from || new Date()}
                    />
                </div>
            }
            footer={
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={onClose} disabled={isExporting}>
                        Отмена
                    </Button>
                    <Button type="button" onClick={handleExport} disabled={isExporting}>
                        {isExporting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Формируем файл...
                            </>
                        ) : (
                            'Скачать Excel'
                        )}
                    </Button>
                </div>
            }
        />
    );
};
