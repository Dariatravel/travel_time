export enum PagesEnum {
    MAIN = 'MAIN',
    HOTELS = 'HOTELS',
    RESERVATION = 'RESERVATION',
    OPERATIONS = 'OPERATIONS',
    LOGIN = 'LOGIN',
    ADVANCED_FILTERS = 'ADVANCED_FILTERS',
    ADMIN_OPERATORS = 'ADMIN_OPERATORS',
}

export const routes = {
    [PagesEnum.MAIN]: '/main',
    [PagesEnum.HOTELS]: '/main/hotels',
    [PagesEnum.RESERVATION]: '/main/reservation',
    [PagesEnum.OPERATIONS]: '/main/operations',
    [PagesEnum.LOGIN]: '/login',
    [PagesEnum.ADVANCED_FILTERS]: '/advanced-filters',
    [PagesEnum.ADMIN_OPERATORS]: '/main/admin/operators',
};
