import { TravelFilterType } from '@/shared/models/hotels';
import { cloneDeep } from 'lodash';

export const isFilterEmpty = (filter: TravelFilterType) => {
    const filterTemp = cloneDeep(filter) ?? {};

    return Object.values(filterTemp).every((value) => value === undefined);
};
