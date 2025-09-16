import { Params } from 'next/dist/server/request/params';

export const getActiveStatus = (href: string, params: Params, pathname: string) => {
    const slicedPathname = params?.slug ? pathname?.replace(`/${params?.slug}`, '') : pathname;
    const isActive = slicedPathname === href;
    return isActive;
};
