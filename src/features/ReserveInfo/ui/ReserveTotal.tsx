import { Text } from '@/components/ui/typography';
// Grid заменен на Tailwind CSS Grid
import moment from 'moment/moment';
import { FC, ReactNode, useMemo } from 'react';

export interface ReserveTotalProps {
    date: [Date?, Date?];
    price: number;
    prepayment?: number;
    Prepayment: ReactNode;
    className?: string;
}

export const ReserveTotal: FC<ReserveTotalProps> = ({
    date,
    prepayment = 0,
    price = 0,
    Prepayment,
    className,
}: ReserveTotalProps) => {
    const totalDays = useMemo(() => {
        if (date?.[0] && date?.[1]) {
            const [start, end] = date;
            return moment(end).hour(12).diff(moment(start).hour(11), 'days');
        }

        return 0;
    }, [date]);

    const totalPrice = useMemo(() => totalDays * price, [totalDays, price]);
    const remainPrice = useMemo(() => totalPrice - prepayment, [totalPrice, prepayment]);
    const postFix = 'руб.';

    const TEXT_SIZE = 's';
    return (
        <div className={`grid grid-cols-2 gap-2 ${className || ''}`}>
            <div>
                <Text view="success" size="m">
                    Итого
                </Text>
            </div>
            <div>
                <Text view="success" size="m">
                    {totalPrice} {postFix}
                </Text>
            </div>
            <div>
                <Text size={TEXT_SIZE}>Количество ночей</Text>
            </div>
            <div>
                <Text size={TEXT_SIZE}>{totalDays}</Text>
            </div>
            <div>
                <Text size={TEXT_SIZE}>Внесено</Text>
            </div>
            <div>{Prepayment}</div>
            <div>
                <Text size={TEXT_SIZE}>Остаток</Text>
            </div>
            <div>
                <Text size={TEXT_SIZE}>
                    {remainPrice} {postFix}
                </Text>
            </div>
        </div>
    );
};
