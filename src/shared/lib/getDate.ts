import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

export const getDate = (): string => {
    return dayjs.tz(dayjs(), 'Europe/Moscow').format('YYYY-MM-DDTHH:mm:ss.SSSSSSZ');
};
