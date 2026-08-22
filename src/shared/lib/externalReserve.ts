type ReserveWithExternalSource = {
    external_source?: string | null;
};

export const isExternalReserve = (reserve?: ReserveWithExternalSource | null): boolean =>
    typeof reserve?.external_source === 'string' && reserve.external_source.trim().length > 0;
