export enum PagesEnum {
    MAIN = 'MAIN',
    HOTELS = 'HOTELS',
    RESERVATION = 'RESERVATION',
    OPERATIONS = 'OPERATIONS',
    LOGIN = 'LOGIN',
    ADVANCED_FILTERS = 'ADVANCED_FILTERS',
    ADMIN_OPERATORS = 'ADMIN_OPERATORS',
    BOOKINGS = 'BOOKINGS',
    MORNING = 'MORNING',
    DEALS = 'DEALS',
    CLIENTS = 'CLIENTS',
    IMPORT = 'IMPORT',
}

export const routes = {
    [PagesEnum.MAIN]: '/main',
    [PagesEnum.HOTELS]: '/main/hotels',
    [PagesEnum.RESERVATION]: '/main/reservation',
    [PagesEnum.OPERATIONS]: '/main/operations',
    [PagesEnum.BOOKINGS]: '/main/bookings',
    [PagesEnum.MORNING]: '/main/morning',
    [PagesEnum.DEALS]: '/main/deals',
    [PagesEnum.CLIENTS]: '/main/clients',
    [PagesEnum.IMPORT]: '/main/import',
    [PagesEnum.LOGIN]: '/login',
    [PagesEnum.ADVANCED_FILTERS]: '/advanced-filters',
    [PagesEnum.ADMIN_OPERATORS]: '/main/admin/operators',
};
