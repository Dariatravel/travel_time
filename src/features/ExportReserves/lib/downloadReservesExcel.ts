import * as XLSX from 'xlsx';

import {
    RESERVE_EXPORT_COLUMNS,
    type ReserveExportSheetRow,
} from '@/features/ExportReserves/lib/reserveExportRow';

export const downloadReservesExcel = (
    rows: ReserveExportSheetRow[],
    periodLabel: string,
) => {
    const worksheet = XLSX.utils.json_to_sheet(rows, {
        header: RESERVE_EXPORT_COLUMNS,
    });
    worksheet['!cols'] = RESERVE_EXPORT_COLUMNS.map((column) => ({
        wch: Math.max(column.length, 14),
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Брони');
    XLSX.writeFile(workbook, `bronirovaniya_${periodLabel}.xlsx`);
};
