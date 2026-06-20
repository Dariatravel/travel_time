import moment, { Moment } from 'moment/moment';

export const getDateFromUnix = (unix: number) => {
    return moment.unix(unix);
};

export const parseReserveTime = (value: number | Date | Moment | string) => {
    if (typeof value === 'number') {
        return moment.unix(value);
    }

    return moment(value);
};
