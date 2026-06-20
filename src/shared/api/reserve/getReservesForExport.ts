import { mapReserveToExportRow, type ReserveExportSheetRow } from '@/features/ExportReserves/lib/reserveExportRow';
import supabase from '@/shared/config/supabase';
import dayjs from 'dayjs';

const PAGE_SIZE = 1000;

type ReserveExportQueryRow = {
    start: number;
    end: number;
    guest: string;
    phone: string;
    comment: string | null;
    price: number;
    quantity: number;
    prepayment: string | null;
    created_by: string | null;
    edited_by: string | null;
    created_at: string;
    edited_at: string | null;
    rooms: {
        title: string;
        hotel_id: string;
        hotels: { title: string | null } | { title: string | null }[] | null;
    } | {
        title: string;
        hotel_id: string;
        hotels: { title: string | null } | { title: string | null }[] | null;
    }[] | null;
};

const normalizeReserveExportQueryRow = (row: ReserveExportQueryRow) => {
    const room = Array.isArray(row.rooms) ? row.rooms[0] : row.rooms;
    const hotel = Array.isArray(room?.hotels) ? room.hotels[0] : room?.hotels;

    return mapReserveToExportRow({
        ...row,
        rooms: room
            ? {
                  title: room.title,
                  hotels: hotel ?? null,
              }
            : null,
    });
};

export type GetReservesForExportParams = {
    periodStart: Date;
    periodEnd: Date;
    hotelIds?: string[];
};

/**
 * Выгружает брони, пересекающиеся с периодом, через обычный Supabase client.
 * Пересечение: start < конец периода и end > начало периода.
 * RLS ограничивает результат объектами, доступными текущему пользователю.
 */
export async function getReservesForExport({
    periodStart,
    periodEnd,
    hotelIds,
}: GetReservesForExportParams): Promise<ReserveExportSheetRow[]> {
    const periodStartUnix = dayjs(periodStart).startOf('day').unix();
    const periodEndUnix = dayjs(periodEnd).endOf('day').unix();

    if (periodStartUnix >= periodEndUnix) {
        throw new Error('Дата начала периода должна быть раньше даты окончания');
    }

    const rows: ReserveExportSheetRow[] = [];
    let page = 0;

    while (true) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabase
            .from('reserves')
            .select(
                `
                start,
                end,
                guest,
                phone,
                comment,
                price,
                quantity,
                prepayment,
                created_by,
                edited_by,
                created_at,
                edited_at,
                rooms!inner (
                    title,
                    hotel_id,
                    hotels!inner (
                        title
                    )
                )
            `,
            )
            .lt('start', periodEndUnix)
            .gt('end', periodStartUnix)
            .order('start', { ascending: true })
            .range(from, to);

        if (hotelIds?.length) {
            query = query.in('rooms.hotel_id', hotelIds);
        }

        const { data, error } = await query;

        if (error) {
            throw new Error(error.message);
        }

        const batch = (data ?? []) as ReserveExportQueryRow[];

        if (batch.length === 0) {
            break;
        }

        rows.push(...batch.map(normalizeReserveExportQueryRow));

        if (batch.length < PAGE_SIZE) {
            break;
        }

        page += 1;
    }

    return rows;
}
