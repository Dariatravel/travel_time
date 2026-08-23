// Поддерживаемый форк SheetJS: в оригинальном пакете xlsx есть незакрытая
// уязвимость разбора файлов. Мы файлы только пишем (экспорт броней), поэтому
// риск был низким, но форк снимает и его, и предупреждение аудита.
import * as XLSX from '@e965/xlsx';

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
