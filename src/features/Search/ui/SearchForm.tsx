import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    AdvancedFilters,
    AdvancedFiltersModel,
    AdvancedFiltersState,
    FilterOption,
} from '@/features/AdvancedFilters';
import { ExportHotelsButton } from '@/features/ExportHotels';
import { HOTEL_TYPES } from '@/features/HotelModal/lib/const';
import { FormMultipleSelector } from '@/features/HotelModal/ui/components';
import { ClearableSelect } from '@/shared';
import {
    FreeHotelsDTO,
    getHotelsWithFreeRooms,
    useGetHotelsForRoom,
} from '@/shared/api/hotel/hotel';
import { PagesEnum, routes } from '@/shared/config/routes';
import { adaptToMultipleSelectorOption } from '@/shared/lib/adaptHotel';
import { setFreeHotelsData } from '@/shared/models/freeHotels';
import { changeTravelFilter, TravelFilterType } from '@/shared/models/hotels';
import { Datepicker } from '@/shared/ui/Datepicker/Datepicker';
import { FormField } from '@/shared/ui/FormField';
import { FormMessage } from '@/shared/ui/FormMessage';
import { zodResolver } from '@hookform/resolvers/zod';
import cn from 'classnames';
import { useUnit } from 'effector-react';
import { cloneDeep } from 'lodash';
import { Search } from 'lucide-react';
import moment from 'moment/moment';
import { useRouter } from 'next/navigation';
import { FC } from 'react';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import z from 'zod';
import styles from './style.module.scss';

export interface SearchFormProps {
    onSearchCb?: () => void;
}

export const searchFormSchema = z.object({
    /** Массив выбранных отелей */
    hotels: z
        .array(
            z.object({
                id: z.string(),
                label: z.string(),
            }),
        )
        .default([]),
    /** Категория отеля */
    category: z.string().optional(),
    /** Дата начала бронирования */
    dateFrom: z.date().optional(),
    /** Дата окончания бронирования */
    dateTo: z.date().optional(),
    /** Количество гостей */
    quantity: z.number().min(0).optional(),
});

export type SearchFormSchema = z.infer<typeof searchFormSchema>;

export const SearchForm: FC<SearchFormProps> = ({ onSearchCb }: SearchFormProps) => {
    const router = useRouter();
    const { data: hotels } = useGetHotelsForRoom();
    const advancedFilters = useUnit(AdvancedFiltersModel.$filters);

    const methods = useForm<SearchFormSchema>({
        resolver: zodResolver(searchFormSchema) as any,
        defaultValues: {
            hotels: [],
            category: undefined,
            dateFrom: undefined,
            dateTo: undefined,
            quantity: undefined,
        },
    });

    const { control, watch, handleSubmit } = methods;
    const watchedValues = watch();

    // Извлекаем значения из формы для сохранения логики
    const dateFrom = watchedValues.dateFrom;
    const dateTo = watchedValues.dateTo;
    const category = watchedValues.category;
    const quantity = watchedValues.quantity;
    const selectedHotels = watchedValues.hotels?.map((hotel) => hotel.id) || [];

    let start_time = undefined,
        end_time = undefined;
    if (dateFrom) {
        start_time = moment(dateFrom).hour(12).unix();
    }

    if (dateTo) {
        end_time = moment(dateTo).hour(11).unix();
    }

    const onSearch = async (data: SearchFormSchema) => {
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

        /**
         * Проверяет, есть ли активные расширенные фильтры
         * @param filters состояние расширенных фильтров
         */
        const hasActiveAdvancedFilters = (filters: AdvancedFiltersState) => {
            return Object.values(filters).some((section) =>
                section.options.some((option: FilterOption) => option.isActive),
            );
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

        // Проверяем, есть ли основные фильтры ИЛИ активные расширенные фильтры
        if (!isAllValuesUndefined(filter) || hasActiveAdvancedFilters(advancedFilters)) {
            const parsedAdvancedFilter = parseFilter(advancedFilters);

            console.log({ parsedAdvancedFilter, filter });
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

            // Сохраняем данные о свободных отелях в отдельный store
            setFreeHotelsData(result);

            console.log({ freeRoomData });
        } else {
            // Очищаем данные о свободных отелях, если фильтры пустые
            setFreeHotelsData([]);
        }

        if (selectedHotels.length !== 0) {
            const filterHotels = hotels?.filter((hotel) => selectedHotels.includes(hotel.id));
            filter.hotels = filterHotels;
        } else {
            filter.hotels = undefined;
        }

        // Добавляем roomFeatures из расширенных фильтров
        const roomFeatures = advancedFilters.roomFeatures?.options
            .filter((option) => option.isActive)
            .map((option) => option.id);

        if (roomFeatures && roomFeatures.length > 0) {
            filter.roomFeatures = roomFeatures;
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

    return (
        <FormProvider {...methods}>
            <Card className={cn('w-full', styles.wrapper)}>
                <CardHeader className="p-3 pl-6">
                    <CardTitle>
                        <div>Поиск предложений</div>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className={cn('flex gap-2 items-end', styles.container)}>
                        {/* Категория отеля */}
                        <div className=" min-w-[225px] max-w-[225px]">
                            <Controller
                                name="category"
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                    <div>
                                        <Label htmlFor="category" className="text-sm block">
                                            Категория отеля
                                        </Label>
                                        <ClearableSelect
                                            value={field.value || ''}
                                            onValueChange={(value) =>
                                                field.onChange(value === '' ? undefined : value)
                                            }
                                            options={HOTEL_TYPES}
                                            clearable
                                            placeholder="Выберите категорию"
                                        />

                                        <FormMessage message={error?.message} />
                                    </div>
                                )}
                            />
                        </div>
                        {/* Период бронирования */}
                        <div className="min-w-[250px] max-w-[250px]">
                            <Controller
                                name="dateFrom"
                                control={control}
                                render={({
                                    field: fieldFrom,
                                    fieldState: { error: errorFrom },
                                }) => (
                                    <Controller
                                        name="dateTo"
                                        control={control}
                                        render={({
                                            field: fieldTo,
                                            fieldState: { error: errorTo },
                                        }) => (
                                            // <FormField>
                                            <>
                                                <Datepicker
                                                    selected={
                                                        fieldFrom.value
                                                            ? {
                                                                  from: fieldFrom.value,
                                                                  to: fieldTo.value || undefined,
                                                              }
                                                            : undefined
                                                    }
                                                    onSelect={(range) => {
                                                        if (range?.from) {
                                                            fieldFrom.onChange(range.from);
                                                            fieldTo.onChange(range.to || undefined);
                                                        } else {
                                                            fieldFrom.onChange(undefined);
                                                            fieldTo.onChange(undefined);
                                                        }
                                                    }}
                                                    label="Период бронирования"
                                                />
                                                <FormMessage
                                                    message={errorFrom?.message || errorTo?.message}
                                                />
                                                {/* </FormField> */}
                                            </>
                                        )}
                                    />
                                )}
                            />
                        </div>
                        <div className="w-full">
                            <Controller
                                name="hotels"
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                    <FormField>
                                        <FormMultipleSelector
                                            label="Выберите отель"
                                            error={error?.message}
                                            value={
                                                field.value?.map((item) => ({
                                                    value: item.id,
                                                    label: item.label,
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
                                            placeholder="Введите название отеля"
                                            htmlFor="hotels"
                                        />
                                        <FormMessage message={error?.message} />
                                    </FormField>
                                )}
                            />
                        </div>
                        {/* Количество гостей */}
                        <div className="min-w-[75px] max-w-[75px]">
                            <Controller
                                name="quantity"
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                    <div className="space-y-2">
                                        <Label
                                            htmlFor="quantity"
                                            className="text-sm font-medium text-gray-700"
                                        >
                                            Гости
                                        </Label>
                                        <Input
                                            id="quantity"
                                            type="number"
                                            value={field.value || ''}
                                            min={0}
                                            placeholder="1"
                                            onChange={(e) =>
                                                field.onChange(
                                                    !!e.target.value
                                                        ? Number(e.target.value)
                                                        : undefined,
                                                )
                                            }
                                        />
                                        <FormMessage message={error?.message} />
                                    </div>
                                )}
                            />
                        </div>
                        {/* Расширенные фильтры */}
                        <div className="">
                            <AdvancedFilters />
                        </div>
                        {/* Кнопка экспорта отелей */}
                        <div className="">
                            <ExportHotelsButton />
                        </div>
                        <div>
                            <Button
                                type="button"
                                onClick={handleSubmit(onSearch as any)}
                                className={cn(styles.searchButton)}
                            >
                                <Search className="mr-2 h-4 w-4" />
                                Найти
                            </Button>
                        </div>
                    </div>

                    {/* Кнопка поиска */}
                </CardContent>
            </Card>
        </FormProvider>
    );
};
