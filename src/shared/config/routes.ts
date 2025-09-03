export enum PagesEnum {
    MAIN = 'MAIN',
    HOTELS = 'HOTELS',
    RESERVATION = 'RESERVATION',
    LOGIN = 'LOGIN',
    ADVANCED_FILTERS = 'ADVANCED_FILTERS',
}

export const routes = {
    [PagesEnum.MAIN]: '/main',
    [PagesEnum.HOTELS]: '/main/hotels',
    [PagesEnum.RESERVATION]: '/main/reservation',
    [PagesEnum.LOGIN]: '/login',
    [PagesEnum.ADVANCED_FILTERS]: '/advanced-filters',
};
