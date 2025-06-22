import { HOTEL_TYPES } from '@/features/HotelModal/lib/const';
import { getHotelsWithFreeRooms } from '@/shared/api/hotel/hotel';
import { PagesEnum, routes } from '@/shared/config/routes';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { changeTravelFilter, TravelFilterType } from '@/shared/models/hotels';
import { IconCalendar } from '@consta/icons/IconCalendar';
import { Button } from '@consta/uikit/Button';
import { DatePicker } from '@consta/uikit/DatePicker';
import { TextField } from '@consta/uikit/TextField';
import { Flex, Select } from 'antd';
import cn from 'classnames';
import moment from 'moment/moment';
import { useRouter } from 'next/navigation';
import { FC, useState } from 'react';
import styles from './style.module.scss';
export interface SearchFeatureProps {}

export const SearchFeature: FC<SearchFeatureProps> = (props: SearchFeatureProps) => {
    const [date, setValue] = useState<[Date?, Date?] | null>(null);
    const [category, setCategory] = useState<string | undefined>();
    const [quantity, setQuantity] = useState<number>();
    const router = useRouter();
    const { isMobile } = useScreenSize();
    const onSearch = async () => {
        let start_time, end_time;
        if (date?.[0]) {
            start_time = moment(date[0]).hour(12).unix();
        }

        if (date?.[1]) {
            end_time = moment(date[1]).hour(11).unix();
        }

        let freeRoomData: Partial<TravelFilterType> = {
            hotels_id: undefined,
            rooms_id: undefined,
            hotels: undefined,
        };

        if (!!start_time && !!end_time) {
            // effector
            // TODO: сюда должна заехать вместимость
            const result = await getHotelsWithFreeRooms(start_time, end_time);

            freeRoomData = {
                hotels_id: result?.map((hotel) => hotel.hotel_id),
                hotels: result.map(({ hotel_id, rooms }) => ({ hotel_id, rooms: rooms.map(({ room_id }) => room_id) })),
                rooms_id: new Map(result?.map((hotel) => [hotel.hotel_id, hotel.rooms.map((room) => room.room_id)])),
            };
        }

        const filter: Partial<TravelFilterType> = {
            type: category ?? undefined,
            start: start_time,
            end: end_time,
            quantity: quantity ?? undefined,
            ...freeRoomData,
        };
        console.log(filter);
        changeTravelFilter(filter);

        router.push(routes[PagesEnum.RESERVATION]);
    };

    const FORM_SIZE = isMobile ? 's' : 'm';

    return (
        <Flex className={styles.container} wrap>
            <Select
                className={cn(styles.categorySelect)}
                options={HOTEL_TYPES}
                value={category}
                onChange={(type) => {
                    setCategory(type);
                }}
                placeholder={'Категория'}
                allowClear
                size={FORM_SIZE === 's' ? 'middle' : 'large'}
            />
            <DatePicker
                className={styles.datePicker}
                type="date-range"
                value={date}
                onChange={(e) => setValue(e)}
                leftSide={[IconCalendar, IconCalendar]}
                placeholder={['Заезд', 'Выезд']}
                dateTimeView={'classic'}
                withClearButton
                size={FORM_SIZE}
                dropdownClassName={styles.datepickerDropdown}
            />
            <TextField
                className={styles.guestsInput}
                value={String(quantity)}
                onChange={(value) => setQuantity(value ? +value : undefined)}
                placeholder={'Гости'}
                type={'number'}
                withClearButton
                incrementButtons={false}
                size={FORM_SIZE}
            />
            <Button className={styles.searchButton} label={'Найти'} onClick={onSearch} size={FORM_SIZE} />
        </Flex>
    );
};
