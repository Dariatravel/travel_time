export const FORM_SIZE = 's';
export const FORM_GAP_SIZE = 's';

export const getTextSize = (isMobile: boolean) => {
    if (isMobile) {
        return 'm';
    }
    return 'xl';
};
