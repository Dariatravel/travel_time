import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    AdvancedFilters,
    AdvancedFiltersModel,
    AdvancedFiltersState,
    FilterOption,
} from '@/features/AdvancedFilters';
import { HOTEL_TYPES } from '@/features/HotelModal/lib/const';
import {
    FreeHotelsDTO,
    getHotelsWithFreeRooms,
    useGetHotelsForRoom,
} from '@/shared/api/hotel/hotel';
import { PagesEnum, routes } from '@/shared/config/routes';
import { adaptToAntOption } from '@/shared/lib/adaptHotel';
import { changeTravelFilter, TravelFilterType } from '@/shared/models/hotels';
import cn from 'classnames';
import dayjs from 'dayjs';
import { useUnit } from 'effector-react';
import { cloneDeep } from 'lodash';
import { CalendarIcon, Search } from 'lucide-react';
import moment from 'moment/moment';
import { useRouter } from 'next/navigation';
import { FC, useState } from 'react';
import styles from './style.module.scss';

export interface SearchFeatureProps {
    onSearchCb?: () => void;
}

export const SearchFeature: FC<SearchFeatureProps> = ({ onSearchCb }: SearchFeatureProps) => {
    const [date, setValue] = useState<[Date?, Date?] | null>(null);
    const [category, setCategory] = useState<string | undefined>();
    const [quantity, setQuantity] = useState<number | undefined>(undefined);
    const [selectedHotels, setSelectedHotels] = useState<string[]>([]);
    const router = useRouter();
    const { data: hotels } = useGetHotelsForRoom();
    const advancedFilters = useUnit(AdvancedFiltersModel.$filters);

    let start_time = undefined,
        end_time = undefined;
    if (date?.[0]) {
        start_time = moment(date[0]).hour(12).unix();
    }

    if (date?.[1]) {
        end_time = moment(date[1]).hour(11).unix();
    }

    const onSearch = async () => {
        const filter: Partial<TravelFilterType> = {
            type: category ?? undefined,
            start: start_time,
            end: end_time,
            quantity: quantity ?? undefined,
        };

        /**
         * Проверяет, что все значения объекта равны undefined
         * @param obj объект для проверки
         */
        const isAllValuesUndefined = (obj: Record<string, unknown>) => {
            const filter = cloneDeep(obj);
            const EXCEPTED_KEY = 'hotels';
            if (filter && filter?.hotels) {
                delete filter[EXCEPTED_KEY];
            }

            return Object.values(filter).every((value) => {
                return value === undefined;
            });
        };

        let freeRoomData: Partial<TravelFilterType> = {
            freeHotels: undefined,
            freeHotels_id: undefined,
        };

        const parseFilter = (filters: AdvancedFiltersState) => {
            const result: Record<string, string[] | null> = {};

            Object.entries(filters).forEach(([key, value]) => {
                const activeOptions = value.options.filter(
                    (option: FilterOption) => option.isActive,
                );

                if (activeOptions.length === 0) {
                    result[key] = null;
                } else {
                    result[key] = activeOptions.map((option: FilterOption) => option.id);
                }
            });

            return result;
        };

        if (!isAllValuesUndefined(filter)) {
            const parsedAdvancedFilter = parseFilter(advancedFilters);

            const result = await getHotelsWithFreeRooms(filter, parsedAdvancedFilter);

            const getHotelsMap = (hotels: FreeHotelsDTO[]) => {
                const getUniqueRooms = (rooms: string[]) => {
                    return Array.from(new Set(rooms));
                };
                return new Map(
                    hotels.map((hotel) => [
                        hotel.hotel_id,
                        getUniqueRooms(hotel.rooms.map((room) => room.room_id)),
                    ]),
                );
            };

            freeRoomData = {
                freeHotels_id: result?.map((hotel) => hotel.hotel_id),
                freeHotels: getHotelsMap(result),
            };

            console.log({ freeRoomData });
        }

        if (selectedHotels.length !== 0) {
            const filterHotels = hotels?.filter((hotel) => selectedHotels.includes(hotel.id));
            filter.hotels = filterHotels;
        } else {
            filter.hotels = undefined;
        }

        console.log({ filter });

        changeTravelFilter({ ...filter, ...freeRoomData });

        if (window.location.pathname !== routes[PagesEnum.RESERVATION]) {
            router.push(routes[PagesEnum.RESERVATION]);
        }

        if (onSearchCb) {
            onSearchCb();
        }
    };

    const hotelOptions = hotels?.map((hotel) => adaptToAntOption(hotel)) ?? [];

    return (
        <Card className={cn('w-full', styles.wrapper)}>
            <CardHeader>
                <CardTitle>Поиск предложений</CardTitle>
            </CardHeader>
            <CardContent>
                <div className={cn('flex gap-2 items-end', styles.container)}>
                    {/* Категория отеля */}
                    <div className=" min-w-[150px] max-w-[200px]">
                        <Label
                            htmlFor="category"
                            className="text-sm font-medium text-gray-700 mb-2 block"
                        >
                            Категория отеля
                        </Label>
                        <Select value={category} onValueChange={(type) => setCategory(type)}>
                            <SelectTrigger className={cn(styles.categorySelect)}>
                                <SelectValue placeholder="Выберите категорию" />
                            </SelectTrigger>
                            <SelectContent>
                                {HOTEL_TYPES.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>
                                        {type.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {/* Период бронирования */}
                    <div className="min-w-[250px] max-w-[250px]">
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                            Период бронирования
                        </Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        'w-full justify-start text-left font-normal',
                                        !date && 'text-muted-foreground',
                                        styles.datePicker,
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date && date[0] && date[1]
                                        ? `${dayjs(date[0]).format('DD.MM.YYYY')} - ${dayjs(date[1]).format('DD.MM.YYYY')}`
                                        : 'Выберите даты'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="range"
                                    selected={date ? { from: date[0], to: date[1] } : undefined}
                                    onSelect={(range) => {
                                        if (range?.from && range?.to) {
                                            setValue([range.from, range.to]);
                                        } else {
                                            setValue(null);
                                        }
                                    }}
                                    numberOfMonths={2}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                    {/* Выбор отелей */}
                    <div className="min-w-[250px] max-w-[250px]">
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                            Выберите отели
                        </Label>
                        <div className="relative">
                            <Select
                                value={selectedHotels.length > 0 ? selectedHotels[0] : undefined}
                                onValueChange={(value) => {
                                    if (value) {
                                        if (selectedHotels.includes(String(value))) {
                                            setSelectedHotels(
                                                selectedHotels.filter((id) => id !== String(value)),
                                            );
                                        } else {
                                            setSelectedHotels([...selectedHotels, String(value)]);
                                        }
                                    } else {
                                        setSelectedHotels([]);
                                    }
                                }}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue
                                        placeholder={
                                            selectedHotels.length > 0
                                                ? `Выбрано отелей: ${selectedHotels.length}`
                                                : 'Выберите отели'
                                        }
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {hotelOptions.map((hotel) => (
                                        <SelectItem
                                            key={String(hotel.value)}
                                            value={String(hotel.value)}
                                            className={cn(
                                                selectedHotels.includes(String(hotel.value)) &&
                                                    'bg-accent',
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedHotels.includes(
                                                        String(hotel.value),
                                                    )}
                                                    onChange={() => {}}
                                                    className="h-4 w-4"
                                                />
                                                {hotel.label}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedHotels.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-white border rounded-md shadow-sm">
                                    <div className="flex flex-wrap gap-1">
                                        {selectedHotels.map((hotelId) => {
                                            const hotel = hotelOptions.find(
                                                (h) => h.value === hotelId,
                                            );
                                            return (
                                                <span
                                                    key={hotelId}
                                                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                                                >
                                                    {hotel?.label}
                                                    <button
                                                        onClick={() =>
                                                            setSelectedHotels(
                                                                selectedHotels.filter(
                                                                    (id) => id !== hotelId,
                                                                ),
                                                            )
                                                        }
                                                        className="ml-1 text-blue-600 hover:text-blue-800"
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Количество гостей */}
                    <div className="min-w-[75px] max-w-[75px]">
                        <Label
                            htmlFor="quantity"
                            className="text-sm font-medium text-gray-700 mb-2 block"
                        >
                            Гости
                        </Label>
                        <Input
                            id="quantity"
                            type="number"
                            value={quantity || ''}
                            min={0}
                            placeholder="1"
                            onChange={(e) =>
                                setQuantity(!!e.target.value ? Number(e.target.value) : undefined)
                            }
                            className={styles.quantityInput}
                        />
                    </div>
                    {/* Расширенные фильтры */}
                    <div className="">
                        <AdvancedFilters />
                    </div>
                    <div>
                        <Button onClick={onSearch} className={cn(styles.searchButton)}>
                            <Search className="mr-2 h-4 w-4" />
                            Найти
                        </Button>
                    </div>
                </div>

                {/* Кнопка поиска */}
            </CardContent>
        </Card>
    );
};
