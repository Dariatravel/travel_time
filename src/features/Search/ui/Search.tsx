import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { FormMultipleSelector } from '@/features/HotelModal/ui/components';
import {
    FreeHotelsDTO,
    getHotelsWithFreeRooms,
    useGetHotelsForRoom,
} from '@/shared/api/hotel/hotel';
import { PagesEnum, routes } from '@/shared/config/routes';
import { adaptToMultipleSelectorOption } from '@/shared/lib/adaptHotel';
import { changeTravelFilter, TravelFilterType } from '@/shared/models/hotels';
import { Datepicker } from '@/shared/ui/Datepicker/Datepicker';
import cn from 'classnames';
import { useUnit } from 'effector-react';
import { cloneDeep } from 'lodash';
import { Search } from 'lucide-react';
import moment from 'moment/moment';
import { useRouter } from 'next/navigation';
import { FC, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import z from 'zod';
import styles from './style.module.scss';

export interface SearchFeatureProps {
    onSearchCb?: () => void;
}

export const searchFormSchema = z.object({
    hotels: z.array(z.string()),
});

export type SearchFormSchema = z.infer<typeof searchFormSchema>;

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

    const hotelOptions = hotels?.map((hotel) => adaptToMultipleSelectorOption(hotel)) ?? [];

    const { control } = useForm<SearchFormSchema>({
        defaultValues: {
            hotels: [],
        },
    });

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
                        <Datepicker
                            selected={date ? { from: date[0], to: date[1] } : undefined}
                            onSelect={(range) => {
                                if (range?.from) {
                                    setValue([range.from, range.to || range.from]);
                                } else {
                                    setValue(null);
                                }
                            }}
                            label="Период бронирования"
                        />
                    </div>{' '}
                    <div className="min-w-[250px] max-w-[250px]">
                        <Controller
                            name="hotels"
                            control={control}
                            render={({ field, fieldState: { error } }) => (
                                <FormMultipleSelector
                                    label="Выберите отель"
                                    error={undefined}
                                    value={
                                        field.value?.map((item: string) => ({
                                            value: item,
                                            label: item,
                                        })) || []
                                    }
                                    onChange={(options) =>
                                        field.onChange(
                                            options.map((option) => ({
                                                id: option.value,
                                                label: option.label,
                                            })),
                                        )
                                    }
                                    options={hotelOptions.map((item) => ({
                                        value: item.value,
                                        label: item.label,
                                    }))}
                                    placeholder="Выберите особенности размещения"
                                    htmlFor="hotels"
                                    // disabled={isLoading}
                                />
                            )}
                        />
                    </div>
                    {/* Количество гостей */}
                    <div className="min-w-[75px] max-w-[75px]">
                        <Label htmlFor="quantity" className="text-foreground!">
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
