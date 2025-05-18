export const FORM_SIZE = 's';
export const FORM_GAP_SIZE = 's';

export const getTextSize = (isMobile: boolean) => {
    if (isMobile) {
        return 'm';
    }
    return '2xl';
};

export const zIndexes = {
    calendarItem: 1,
    select: 100,
    modal: 99,
    dateSelect: 99,
};

export const ZOOM_UNITS = ['day', 'month', 'year'] as const;
export type ZoomUnit = (typeof ZOOM_UNITS)[number];
