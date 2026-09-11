import type { TDocumentDefinitions } from 'pdfmake/interfaces';

import { transferVoucherLines, voucherLines, type VoucherModel } from './voucher';

/**
 * PDF ваучера — на клиенте, через pdfmake: в его шрифте Roboto есть кириллица,
 * поэтому отдельный файл шрифта не нужен. Библиотека тяжёлая (~1,5 МБ),
 * поэтому подгружается только в момент нажатия кнопки.
 *
 * Текст в PDF — обычный (не картинка): программа напоминаний читает его
 * через pdfplumber по меткам из voucher.ts.
 */

type PdfMakeLike = {
    vfs?: Record<string, string>;
    createPdf: (doc: TDocumentDefinitions) => { getBlob: (cb: (blob: Blob) => void) => void };
};

let pdfMakePromise: Promise<PdfMakeLike> | null = null;

const loadPdfMake = (): Promise<PdfMakeLike> => {
    if (!pdfMakePromise) {
        pdfMakePromise = (async () => {
            const [pdfMakeModule, fontsModule] = await Promise.all([
                import('pdfmake/build/pdfmake'),
                import('pdfmake/build/vfs_fonts'),
            ]);
            const pdfMake = ((pdfMakeModule as { default?: unknown }).default ??
                pdfMakeModule) as PdfMakeLike;
            const fonts = fontsModule as unknown as {
                vfs?: Record<string, string>;
                default?: { vfs?: Record<string, string> } | Record<string, string>;
                pdfMake?: { vfs?: Record<string, string> };
            };
            // Разные сборки pdfmake экспортируют шрифты по-разному.
            const vfs =
                fonts.vfs ??
                fonts.pdfMake?.vfs ??
                (fonts.default && 'vfs' in fonts.default
                    ? (fonts.default as { vfs?: Record<string, string> }).vfs
                    : (fonts.default as Record<string, string> | undefined));
            if (vfs && !pdfMake.vfs) pdfMake.vfs = vfs;

            return pdfMake;
        })();
    }

    return pdfMakePromise;
};

const toDocument = (lines: string[], title: string): TDocumentDefinitions => {
    const content = lines.map((line) => {
        if (line === title) {
            return { text: line, style: 'title', margin: [0, 6, 0, 6] as [number, number, number, number] };
        }
        if (line === 'Детали бронирования:') {
            return { text: line, bold: true, margin: [0, 6, 0, 2] as [number, number, number, number] };
        }
        if (line === '') {
            return { text: ' ', margin: [0, 2, 0, 2] as [number, number, number, number] };
        }

        return { text: line, margin: [0, 1, 0, 1] as [number, number, number, number] };
    });

    return {
        pageSize: 'A4',
        pageMargins: [48, 48, 48, 48],
        defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.25 },
        styles: { title: { fontSize: 16, bold: true } },
        info: { title, author: 'АБХАЗБЕРЕГ' },
        content,
    };
};

const renderBlob = async (doc: TDocumentDefinitions): Promise<Blob> => {
    const pdfMake = await loadPdfMake();

    return new Promise((resolve) => pdfMake.createPdf(doc).getBlob(resolve));
};

export const renderVoucherPdf = (model: VoucherModel): Promise<Blob> =>
    renderBlob(toDocument(voucherLines(model), 'Ваучер На Проживание'));

export const renderTransferVoucherPdf = (model: VoucherModel, seasonYear: number): Promise<Blob> =>
    renderBlob(toDocument(transferVoucherLines(model, seasonYear), 'Ваучер на перенос бронирования'));

/** Скачать blob в браузере под нужным именем. */
export const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
