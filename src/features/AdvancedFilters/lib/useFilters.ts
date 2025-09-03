import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { QueryStringFilter } from './types';

export const useFilters = () => {
    const queryStringFilter = useSearchParams();
    const [queryStringFilters, setQueryStringFilters] = useState<QueryStringFilter>(
        Object.fromEntries(queryStringFilter.entries()),
    );
    const filterParams = queryStringFilter.entries();
    const filterParamsMap = filterParams.map(([key, value]) => ({ [key]: value }));
    return { queryStringFilters, filterParamsMap };
};
