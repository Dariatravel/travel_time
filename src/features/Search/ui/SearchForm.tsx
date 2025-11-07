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
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { setFreeHotelsData } from '@/shared/models/freeHotels';
import {
    $hotelsFilter,
    changeTravelFilter,
    setLoading,
    TravelFilterType,
} from '@/shared/models/hotels';
import { Datepicker } from '@/shared/ui/Datepicker/Datepicker';
import { FormField } from '@/shared/ui/FormField';
import { FormMessage } from '@/shared/ui/FormMessage';
import { zodResolver } from '@hookform/resolvers/zod';
import cn from 'classnames';
import { useUnit } from 'effector-react';
import { useUnit as useUnitCompat } from 'effector-react/compat';
import { cloneDeep } from 'lodash';
import { ChevronDown, Search } from 'lucide-react';
import moment from 'moment/moment';
import { useRouter } from 'next/navigation';
import { FC, useEffect, useState } from 'react';
import type { Resolver, SubmitHandler } from 'react-hook-form';
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
    const filter = useUnitCompat($hotelsFilter);
    const { isMobile } = useScreenSize();
    const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    const methods = useForm<SearchFormSchema>({
        resolver: zodResolver(searchFormSchema) as Resolver<SearchFormSchema>,
        defaultValues: {
            hotels: [],
            category: undefined,
            dateFrom: undefined,
            dateTo: undefined,
            quantity: undefined,
        },
    });

    const { control, watch, handleSubmit, reset } = methods;
    const watchedValues = watch();

    // Инициализируем форму из URL параметров или filter store при первой загрузке
    useEffect(() => {
        // Инициализация происходит только один раз
        if (isInitialized || !hotels) return;

        // Читаем параметры из URL
        const searchParams = new URLSearchParams(window.location.search);
        const urlCategory = searchParams.get('category');
        const urlDateFrom = searchParams.get('dateFrom');
        const urlDateTo = searchParams.get('dateTo');
        const urlQuantity = searchParams.get('quantity');
        const urlHotels = searchParams.get('hotels');

        const formValues: Partial<SearchFormSchema> = {};
        const filterValues: Partial<TravelFilterType> = {};

        // Приоритет: URL параметры > filter store
        if (urlCategory) {
            formValues.category = urlCategory;
            filterValues.type = urlCategory;
        } else if (filter?.type) {
            formValues.category = filter.type;
            filterValues.type = filter.type;
        }

        if (urlQuantity) {
            const quantity = parseInt(urlQuantity, 10);
            formValues.quantity = quantity;
            filterValues.quantity = quantity;
        } else if (filter?.quantity) {
            formValues.quantity = filter.quantity;
            filterValues.quantity = filter.quantity;
        }

        if (urlDateFrom) {
            const start = parseInt(urlDateFrom, 10);
            formValues.dateFrom = moment.unix(start).toDate();
            filterValues.start = start;
        } else if (filter?.start) {
            formValues.dateFrom = moment.unix(filter.start).toDate();
            filterValues.start = filter.start;
        }

        if (urlDateTo) {
            const end = parseInt(urlDateTo, 10);
            formValues.dateTo = moment.unix(end).toDate();
            filterValues.end = end;
        } else if (filter?.end) {
            formValues.dateTo = moment.unix(filter.end).toDate();
            filterValues.end = filter.end;
        }

        // Обработка отелей из URL
        if (urlHotels && hotels) {
            const hotelIds = urlHotels.split(',');
            const selectedHotelsData = hotels.filter((h) => hotelIds.includes(h.id));
            const selectedHotels = selectedHotelsData.map((h) => ({ id: h.id, label: h.title }));
            if (selectedHotels.length > 0) {
                formValues.hotels = selectedHotels;
                filterValues.hotels = selectedHotelsData;
            }
        } else if (filter?.hotels) {
            formValues.hotels = filter.hotels.map((hotel) => ({
                id: hotel.id,
                label: hotel.title,
            }));
            filterValues.hotels = filter.hotels;
        }

        // Обновляем форму
        if (Object.keys(formValues).length > 0) {
            reset(formValues);
        }

        // Обновляем filter store
        if (Object.keys(filterValues).length > 0) {
            changeTravelFilter(filterValues);
        }

        setIsInitialized(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hotels, isInitialized]); // Зависимость от hotels и isInitialized

    useEffect(() => {
        if (isMobile) {
            setIsMobileFiltersOpen(false);
        } else {
            setIsMobileFiltersOpen(true);
        }
    }, [isMobile]);

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

    const onSearch: SubmitHandler<SearchFormSchema> = async () => {
        // Обновление URL происходит через FiltersSync для расширенных фильтров
        // Параметры формы можно обновлять отдельно, если нужно

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

        // Проверяем активные расширенные фильтры после применения
        const hasActiveFilters = hasActiveAdvancedFilters(advancedFilters);

        // Логирование для отладки
        console.log('SearchForm.onSearch - filter before getHotelsWithFreeRooms:', {
            start: filter.start,
            end: filter.end,
            start_time,
            end_time,
            type: filter.type,
            quantity: filter.quantity,
            hasActiveFilters,
        });

        // Проверяем, есть ли основные фильтры ИЛИ активные расширенные фильтры
        if (!isAllValuesUndefined(filter) || hasActiveFilters) {
            // Устанавливаем состояние загрузки
            setLoading(true);

            try {
                // Парсим расширенные фильтры только если они активны
                const parsedAdvancedFilter = hasActiveFilters ? parseFilter(advancedFilters) : {};

                console.log('SearchForm.onSearch - calling getHotelsWithFreeRooms with:', {
                    filter,
                    parsedAdvancedFilter,
                });

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
            } catch (error) {
                console.error('Ошибка при получении свободных отелей:', error);
            } finally {
                // Сбрасываем состояние загрузки
                setLoading(false);
            }
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

        changeTravelFilter({ ...filter, ...freeRoomData });

        // Проверяем, все ли фильтры пустые
        const allFiltersEmpty =
            !category &&
            !start_time &&
            !end_time &&
            !quantity &&
            selectedHotels.length === 0 &&
            !hasActiveFilters;

        // Если все фильтры пустые, сбрасываем все query параметры
        if (allFiltersEmpty) {
            console.log('SearchForm.onSearch - all filters empty, clearing URL and filters');

            // Сбрасываем расширенные фильтры
            AdvancedFiltersModel.filtersCleared();

            // Очищаем filter store
            changeTravelFilter({
                start: undefined,
                end: undefined,
                type: undefined,
                quantity: undefined,
                hotels: undefined,
                freeHotels: undefined,
                freeHotels_id: undefined,
                roomFeatures: undefined,
            });

            // Переходим на чистый URL
            const cleanUrl = routes[PagesEnum.RESERVATION];
            if (window.location.pathname !== routes[PagesEnum.RESERVATION]) {
                router.push(cleanUrl);
            } else {
                router.replace(cleanUrl);
            }

            if (onSearchCb) {
                onSearchCb();
            }
            return;
        }

        // Обновляем URL с базовыми фильтрами
        const searchParams = new URLSearchParams(window.location.search);

        // Добавляем/обновляем базовые фильтры
        if (category) {
            searchParams.set('category', category);
        } else {
            searchParams.delete('category');
        }

        if (start_time) {
            searchParams.set('dateFrom', start_time.toString());
        } else {
            searchParams.delete('dateFrom');
        }

        if (end_time) {
            searchParams.set('dateTo', end_time.toString());
        } else {
            searchParams.delete('dateTo');
        }

        if (quantity !== undefined && quantity > 0) {
            searchParams.set('quantity', quantity.toString());
        } else {
            searchParams.delete('quantity');
        }

        const selectedHotelsFromForm = watchedValues.hotels || [];
        if (selectedHotelsFromForm && selectedHotelsFromForm.length > 0) {
            searchParams.set('hotels', selectedHotelsFromForm.map((h) => h.id).join(','));
        } else {
            searchParams.delete('hotels');
        }

        const newUrl = `${routes[PagesEnum.RESERVATION]}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

        if (window.location.pathname !== routes[PagesEnum.RESERVATION]) {
            router.push(newUrl);
        } else {
            router.replace(newUrl);
        }

        if (onSearchCb) {
            onSearchCb();
        }
    };

    const hotelOptions = hotels?.map((hotel) => adaptToMultipleSelectorOption(hotel)) ?? [];

    return (
        <FormProvider {...methods}>
            <Card className={cn('w-full  bg-transparent', styles.wrapper)}>
                <CardHeader className="p-0">
                    <CardTitle className="text-base font-semibold text-foreground sm:text-lg">
                        {/* Поиск предложений */}
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-4 pt-2 sm:px-6 sm:pb-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
                        {/* Категория отеля */}
                        <div className="flex w-full items-end gap-2 sm:w-auto sm:min-w-[220px] sm:max-w-[220px]">
                            <div className="w-full">
                                <Controller
                                    name="category"
                                    control={control}
                                    render={({ field, fieldState: { error } }) => (
                                        <div className="space-y-2">
                                            <Label
                                                htmlFor="category"
                                                className="text-sm font-medium"
                                            >
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
                            <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-10 w-10 shrink-0 rounded-full sm:hidden "
                                onClick={() => setIsMobileFiltersOpen((prev) => !prev)}
                                aria-label="Показать дополнительные фильтры"
                            >
                                <ChevronDown
                                    className={cn(
                                        'h-4 w-4 transition-transform duration-200',
                                        isMobileFiltersOpen && 'rotate-180',
                                    )}
                                />
                            </Button>
                        </div>

                        <div
                            className={cn(
                                'flex w-full flex-col gap-3 sm:flex-1 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4',
                                styles.container,
                                isMobile && !isMobileFiltersOpen && 'hidden',
                            )}
                        >
                            {/* Период бронирования */}
                            <div className="w-full sm:w-auto sm:min-w-[250px] sm:max-w-[280px]">
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
                                                <div className="space-y-2">
                                                    <Datepicker
                                                        selected={
                                                            fieldFrom.value
                                                                ? {
                                                                      from: fieldFrom.value,
                                                                      to:
                                                                          fieldTo.value ||
                                                                          undefined,
                                                                  }
                                                                : undefined
                                                        }
                                                        onSelect={(range) => {
                                                            if (range?.from) {
                                                                fieldFrom.onChange(range.from);
                                                                fieldTo.onChange(
                                                                    range.to || undefined,
                                                                );
                                                            } else {
                                                                fieldFrom.onChange(undefined);
                                                                fieldTo.onChange(undefined);
                                                            }
                                                        }}
                                                        label="Период бронирования"
                                                    />
                                                    <FormMessage
                                                        message={
                                                            errorFrom?.message || errorTo?.message
                                                        }
                                                    />
                                                </div>
                                            )}
                                        />
                                    )}
                                />
                            </div>
                            <div className="w-full sm:flex-1">
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
                            <div className="w-full sm:w-[110px]">
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
                            {/* Расширенные фильтры и экспорт */}
                            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                                <AdvancedFilters
                                    onFiltersChange={(filters) => {
                                        // Обновляем состояние расширенных фильтров при применении
                                        // Это гарантирует, что при поиске используются актуальные фильтры
                                        AdvancedFiltersModel.filtersHydrated(filters);
                                    }}
                                />
                                <ExportHotelsButton />
                            </div>
                            <div className="w-full sm:w-auto">
                                <Button
                                    type="button"
                                    onClick={handleSubmit(onSearch)}
                                    className={cn('w-full sm:w-auto', styles.searchButton)}
                                >
                                    <Search className="mr-2 h-4 w-4" />
                                    Найти
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Кнопка поиска */}
                </CardContent>
            </Card>
        </FormProvider>
    );
};
