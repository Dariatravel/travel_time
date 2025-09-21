'use client';
import { INITIAL_FILTERS, TRAVEL_TIME_DEFAULTS } from '@/features/AdvancedFilters/lib/constants';
import { HOTEL_TYPES } from '@/features/HotelModal/lib/const';
import { PhoneInput } from '@/shared';
import { TravelUser } from '@/shared/api/auth/auth';
import { CreateHotelDTO, Hotel, HotelDTO } from '@/shared/api/hotel/hotel';
import { CurrentReserveType, Nullable } from '@/shared/api/reserve/reserve';
import { adaptToOption } from '@/shared/lib/adaptHotel';
import { translateUserRole } from '@/shared/lib/translateUser';
import { FormButtons } from '@/shared/ui/FormButtons/FormButtons';
import { LinkIcon } from '@/shared/ui/LinkIcon/LinkIcon';
import { showToast } from '@/shared/ui/Toast/Toast';
import { zodResolver } from '@hookform/resolvers/zod';
import cn from 'classnames';
import { FC, useCallback, useMemo } from 'react';
import { Controller, FormProvider, SubmitErrorHandler, useForm } from 'react-hook-form';
import { FaTelegram } from 'react-icons/fa';
import { HotelFormSchema, hotelFormSchema } from '../lib/validation';
import { FormInput } from './components/FormInput';
import { FormMultipleSelector } from './components/FormMultipleSelector';
import { FormSelect } from './components/FormSelect';
import { FormTextarea } from './components/FormTextarea';
import cx from './style.module.css';

export interface HotelInfoProps {
    users: TravelUser[];
    onClose: () => void;
    onAccept: (hotel: Hotel | CreateHotelDTO) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    currentReserve: Nullable<CurrentReserveType>;
    isLoading?: boolean;
    isEdit: boolean;
}

const DEFAULT_VALUE = { rating: '5', telegram_url: 'https://t.me/' };

const getInitialValue = (hotel?: Nullable<HotelDTO>): Partial<HotelFormSchema> => {
    const rating = String(hotel?.rating) ?? DEFAULT_VALUE.rating;
    return {
        ...DEFAULT_VALUE,
        ...hotel,
        rating,
        user_id: hotel?.user_id
            ? adaptToOption({ title: hotel?.user_id, id: hotel?.user_id })
            : undefined,
        type: hotel?.type ? adaptToOption({ title: hotel?.type, id: hotel?.type }) : undefined,
        description: hotel?.description || '',
        image_id: hotel?.image_id ? { id: hotel.image_id, file: new File([], '') } : null,
        beach: hotel?.beach ? adaptToOption({ title: hotel?.beach, id: hotel?.beach }) : undefined,
        beach_distance: hotel?.beach_distance
            ? adaptToOption({ title: hotel?.beach_distance, id: hotel?.beach_distance })
            : undefined,
        features: hotel?.features
            ? INITIAL_FILTERS.features.options.filter((item) =>
                  hotel?.features.includes(item.value),
              )
            : [],
        eat: hotel?.eat
            ? INITIAL_FILTERS.eat.options.filter((item) => hotel?.eat.includes(item.value))
            : [],
        city: hotel?.city ? adaptToOption({ title: hotel?.city, id: hotel?.city }) : undefined,
    };
};

const deserializeData = (data: HotelFormSchema): Hotel | CreateHotelDTO => {
    const hotelData = {
        ...data,
        type: data.type.label,
        rating: +data?.rating,
        user_id: data?.user_id?.id,
        description: data?.description || '',
        beach: data?.beach?.id,
        beach_distance: data?.beach_distance?.id,
        features: data?.features?.map((item) => item.id),
        eat: data?.eat?.map((item) => item.id),
        city: data?.city?.id,
    };

    console.log({ data });
    if (data?.id) {
        return {
            ...hotelData,
            id: data.id,
        } as Hotel;
    }

    return hotelData as CreateHotelDTO;
};

export const HotelInfo: FC<HotelInfoProps> = ({
    users,
    onAccept,
    onDelete,
    onClose,
    currentReserve,
    isLoading = false,
    isEdit = false,
}: HotelInfoProps) => {
    const form = useForm<HotelFormSchema>({
        defaultValues: getInitialValue(currentReserve?.hotel),
        mode: 'onBlur',
        reValidateMode: 'onBlur',
        resolver: zodResolver(hotelFormSchema),
    });
    const {
        control,
        handleSubmit,
        watch,
        formState: { errors },
    } = form;

    const userOptions = useMemo(() => {
        return users?.map((user) =>
            adaptToOption({
                title: `${translateUserRole(user?.role).toLowerCase()} ${user?.name} ${user?.surname}, ${user?.email}  `,
                id: user?.sub,
            }),
        );
    }, [users]);

    const telegramUrl = watch('telegram_url');

    const onAcceptForm = useCallback(
        async (data: HotelFormSchema) => {
            const serializedData = deserializeData(data);
            await onAccept(serializedData);
        },
        [onAccept],
    );

    const onError: SubmitErrorHandler<HotelFormSchema> = () => {
        console.log('data', { values: watch() });
        showToast(`Заполните все обязательные поля`, 'error');
        return;
    };

    return (
        <FormProvider {...form}>
            <div className="flex flex-col gap-2">
                <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-2">
                    <Controller
                        name="title"
                        control={control}
                        rules={{ required: 'Название отеля обязательно для заполнения' }}
                        render={({ field, fieldState: { error } }) => (
                            <FormInput
                                label="Название отеля"
                                required
                                error={error?.message}
                                value={field.value}
                                onChange={field.onChange}
                                placeholder="Введите название"
                                disabled={isLoading}
                                className={cx.fields}
                                htmlFor="title"
                            />
                        )}
                    />

                    <Controller
                        name="type"
                        control={control}
                        rules={{ required: 'Тип отеля обязателен для заполнения' }}
                        render={({ field, fieldState: { error } }) => (
                            <FormSelect
                                label="Тип"
                                required
                                error={error?.message}
                                value={field.value?.id}
                                onValueChange={(value) => {
                                    const selectedType = HOTEL_TYPES.find(
                                        (type) => type.value === value,
                                    );
                                    if (selectedType) {
                                        field.onChange({
                                            id: selectedType.value,
                                            label: selectedType.label,
                                        });
                                    }
                                }}
                                options={HOTEL_TYPES}
                                placeholder="Выберите из списка"
                                disabled={isLoading}
                                className={cx.fields}
                                htmlFor="type"
                            />
                        )}
                    />
                </div>
                <Controller
                    control={control}
                    name="city"
                    rules={{ required: 'Город обязателен для заполнения' }}
                    render={({ field, fieldState: { error } }) => (
                        <FormSelect
                            label="Город"
                            error={error?.message}
                            value={field.value?.id}
                            onValueChange={(value) => {
                                const selectedCity = TRAVEL_TIME_DEFAULTS.city.find(
                                    (city) => city.value === value,
                                );
                                if (selectedCity) {
                                    field.onChange({
                                        id: selectedCity.value,
                                        label: selectedCity.label,
                                    });
                                }
                            }}
                            options={TRAVEL_TIME_DEFAULTS.city}
                            placeholder="Выберите город"
                            disabled={isLoading}
                            className={cx.fields}
                            htmlFor="city"
                        />
                    )}
                />
                <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-2">
                    <Controller
                        name="address"
                        control={control}
                        rules={{ required: 'Адрес обязателен для заполнения' }}
                        render={({ field, fieldState: { error } }) => (
                            <FormInput
                                label="Местоположение"
                                required
                                error={error?.message}
                                value={field.value}
                                onChange={field.onChange}
                                placeholder="Введите адрес"
                                disabled={isLoading}
                                className={cx.fields}
                                htmlFor="address"
                            />
                        )}
                    />

                    <Controller
                        name="telegram_url"
                        control={control}
                        render={({ field, fieldState: { error } }) => (
                            <div className="relative space-y-2">
                                <FormInput
                                    label="Ссылка на отель в Telegram"
                                    error={error?.message}
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder="Вставьте ссылку"
                                    disabled={isLoading}
                                    className={cx.fields}
                                    htmlFor="telegram_url"
                                />
                                {telegramUrl && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <LinkIcon
                                            icon={<FaTelegram color="2AABEE" size={'24px'} />}
                                            link={telegramUrl}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    />
                </div>
                <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-2">
                    <PhoneInput
                        control={control}
                        name="phone"
                        placeholder="+7 (...)"
                        required
                        label="Номер телефона"
                        disabled={isLoading}
                        className={`$cx.fields}`}
                    />
                    <Controller
                        name="user_id"
                        control={control}
                        rules={{ required: 'Отельер обязателен для заполнения' }}
                        render={({ field, fieldState: { error } }) => (
                            <FormSelect
                                label="Отельер"
                                required
                                error={error?.message}
                                value={field.value?.id}
                                onValueChange={(value) => {
                                    const selectedUser = userOptions?.find(
                                        (user) => user.id === value,
                                    );
                                    field.onChange(selectedUser);
                                }}
                                options={
                                    userOptions?.map((user) => ({
                                        value: user.id,
                                        label: user.label,
                                    })) || []
                                }
                                placeholder="Выберите отельера"
                                disabled={isLoading}
                                className={cx.fields}
                                htmlFor="user_id"
                            />
                        )}
                    />
                </div>
                <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-2">
                    <Controller
                        name="beach"
                        control={control}
                        render={({ field, fieldState: { error } }) => (
                            <FormSelect
                                label="Пляж"
                                error={error?.message}
                                value={field.value?.id}
                                onValueChange={(value) => {
                                    const selectedBeach = TRAVEL_TIME_DEFAULTS.beach.find(
                                        (beach) => beach.value === value,
                                    );
                                    if (selectedBeach) {
                                        field.onChange({
                                            id: selectedBeach.value,
                                            label: selectedBeach.label,
                                        });
                                    }
                                }}
                                options={TRAVEL_TIME_DEFAULTS.beach}
                                placeholder="Выберите пляж"
                                disabled={isLoading}
                                className={cx.fields}
                                htmlFor="beach"
                            />
                        )}
                    />
                    <Controller
                        name="beach_distance"
                        control={control}
                        render={({ field, fieldState: { error } }) => (
                            <FormSelect
                                label="Расстояние до пляжа"
                                error={error?.message}
                                value={field.value?.id}
                                onValueChange={(value) => {
                                    const selectedDistance =
                                        TRAVEL_TIME_DEFAULTS.beach_distance.find(
                                            (distance) => distance.value === value,
                                        );
                                    if (selectedDistance) {
                                        field.onChange({
                                            id: selectedDistance.value,
                                            label: selectedDistance.label,
                                        });
                                    }
                                }}
                                options={TRAVEL_TIME_DEFAULTS.beach_distance}
                                placeholder="Выберите расстояние до пляжа"
                                disabled={isLoading}
                                className={cx.fields}
                                htmlFor="beach_distance"
                            />
                        )}
                    />
                </div>
                <Controller
                    name="features"
                    control={control}
                    render={({ field, fieldState: { error } }) => (
                        <FormMultipleSelector
                            label="Особенности"
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
                            options={TRAVEL_TIME_DEFAULTS.features.map((item) => ({
                                value: item.value,
                                label: item.label,
                            }))}
                            placeholder="Выберите особенности размещения"
                            disabled={isLoading}
                            htmlFor="features"
                        />
                    )}
                />
                <Controller
                    name="eat"
                    control={control}
                    render={({ field, fieldState: { error } }) => (
                        <FormMultipleSelector
                            label="Питание"
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
                            options={TRAVEL_TIME_DEFAULTS.eat.map((item) => ({
                                value: item.value,
                                label: item.label,
                            }))}
                            placeholder="Выберите варианты питания"
                            disabled={isLoading}
                            htmlFor="eat"
                        />
                    )}
                />
                <Controller
                    name="description"
                    control={control}
                    render={({ field, fieldState: { error } }) => (
                        <FormTextarea
                            label="Комментарии"
                            error={error?.message}
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Введите комментарий"
                            disabled={isLoading}
                            className={cn(cx.fields, cx.description)}
                            htmlFor="description"
                            rows={3}
                        />
                    )}
                />
                <FormButtons
                    onDelete={() => currentReserve?.hotel && onDelete(currentReserve?.hotel.id)}
                    deleteText={'Удалить отель'}
                    isEdit={isEdit}
                    isLoading={isLoading}
                    onAccept={handleSubmit(onAcceptForm, onError)}
                    onClose={onClose}
                />
            </div>
        </FormProvider>
    );
};
