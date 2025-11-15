'use client';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { INITIAL_FILTERS, TRAVEL_TIME_DEFAULTS } from '@/features/AdvancedFilters/lib/constants';
import { HOTEL_TYPES } from '@/features/HotelModal/lib/const';
import { FormButtons, PhoneInput } from '@/shared';
import { TravelUser } from '@/shared/api/auth/auth';
import { CreateHotelDTO, Hotel, HotelDTO } from '@/shared/api/hotel/hotel';
import { CurrentReserveType, Nullable } from '@/shared/api/reserve/reserve';
import { adaptToOption } from '@/shared/lib/adaptHotel';
import { translateUserRole } from '@/shared/lib/translateUser';
import { LinkIcon } from '@/shared/ui/LinkIcon/LinkIcon';
import { showToast } from '@/shared/ui/Toast/Toast';
import { zodResolver } from '@hookform/resolvers/zod';
import cn from 'classnames';
import { Info } from 'lucide-react';
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

// Функция для нормализации формата телефона из БД в формат +7(XXX)XXX-XX-XX
const normalizePhone = (phone?: string): string => {
    if (!phone) return '';
    // Если уже в правильном формате, возвращаем как есть
    if (/^\+7\(\d{3}\)\d{3}-\d{2}-\d{2}$/.test(phone)) {
        return phone;
    }
    // Убираем все нецифровые символы
    const numbers = phone.replace(/\D/g, '');
    // Если начинается с 8, заменяем на 7
    const normalizedNumbers = numbers.startsWith('8') ? '7' + numbers.slice(1) : numbers;
    // Если не начинается с 7, добавляем 7
    const finalNumbers = normalizedNumbers.startsWith('7')
        ? normalizedNumbers
        : '7' + normalizedNumbers;
    // Ограничиваем длину до 11 цифр
    const limitedNumbers = finalNumbers.slice(0, 11);
    // Форматируем в +7(XXX)XXX-XX-XX
    if (limitedNumbers.length === 11) {
        return `+7(${limitedNumbers.slice(1, 4)})${limitedNumbers.slice(4, 7)}-${limitedNumbers.slice(7, 9)}-${limitedNumbers.slice(9)}`;
    }
    return phone; // Если не удалось отформатировать, возвращаем исходное значение
};

const getInitialValue = (hotel?: Nullable<HotelDTO>): Partial<HotelFormSchema> => {
    const rating = String(hotel?.rating) ?? DEFAULT_VALUE.rating;
    return {
        ...DEFAULT_VALUE,
        ...hotel,
        rating,
        phone: normalizePhone(hotel?.phone),
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
            ? INITIAL_FILTERS.features.options
                  .filter((item) => hotel?.features.includes(item.value))
                  .map((item) => ({ id: item.value, label: item.label }))
            : [],
        eat: hotel?.eat
            ? INITIAL_FILTERS.eat.options
                  .filter((item) => hotel?.eat.includes(item.value))
                  .map((item) => ({ id: item.value, label: item.label }))
            : [],
        city: hotel?.city ? adaptToOption({ title: hotel?.city, id: hotel?.city }) : undefined,
    };
};

const deserializeData = (data: HotelFormSchema): Hotel | CreateHotelDTO => {
    const hotelData = {
        ...data,
        type: data.type.label,
        rating: +(data?.rating || '5'),
        user_id: data?.user_id?.id,
        description: data?.description || '',
        beach: data?.beach?.id,
        beach_distance: data?.beach_distance?.id,
        features: data?.features?.map((item) => item?.id).filter(Boolean),
        eat: data?.eat?.map((item) => item?.id).filter(Boolean),
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
        // @ts-expect-error - zodResolver type inference issue with complex schemas
        resolver: zodResolver(hotelFormSchema),
    });
    const { control, handleSubmit, watch } = form;

    const userOptions = useMemo(() => {
        return users?.map((user) =>
            adaptToOption({
                title: `${user?.surname} ${user?.name} `,
                id: user?.sub,
            }),
        );
    }, [users]);

    // Находим выбранного пользователя для отображения информации
    const selectedUserId = watch('user_id')?.id;
    const selectedUser = useMemo(() => {
        return users?.find((user) => user.sub === selectedUserId);
    }, [users, selectedUserId]);

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
            <form>
                <div className="flex flex-col gap-1">
                    <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-1">
                        <Controller
                            name="title"
                            control={control}
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
                                    <div className="relative">
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
                                            <div className="absolute right-3 top-1/2">
                                                <LinkIcon
                                                    icon={
                                                        <FaTelegram color="2AABEE" size={'24px'} />
                                                    }
                                                    link={telegramUrl}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        />
                    </div>
                    <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-2">
                        <PhoneInput
                            // @ts-expect-error - Control type mismatch between form and component
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
                            render={({ field, fieldState: { error } }) => (
                                <div className="space-y-2 w-full">
                                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        Отельер <span className="text-red-600">*</span>
                                    </label>
                                    <div className="flex items-start gap-2 w-full">
                                        <div className="flex-1 min-w-0">
                                            <FormSelect
                                                label=""
                                                required={false}
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
                                                className={cn(cx.fields, 'w-full')}
                                                htmlFor="user_id"
                                            />
                                        </div>
                                        {selectedUser && (
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-10 w-10 shrink-0"
                                                    >
                                                        <Info className="h-4 w-4" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-80">
                                                    <div className="space-y-2">
                                                        <h4 className="font-medium leading-none">
                                                            Информация о пользователе
                                                        </h4>
                                                        <div className="text-sm space-y-1">
                                                            <p>
                                                                <span className="font-medium">
                                                                    Имя:
                                                                </span>{' '}
                                                                {selectedUser.name}{' '}
                                                                {selectedUser.surname}
                                                            </p>
                                                            <p>
                                                                <span className="font-medium">
                                                                    Email:
                                                                </span>{' '}
                                                                {selectedUser.email}
                                                            </p>
                                                            <p>
                                                                <span className="font-medium">
                                                                    Роль:
                                                                </span>{' '}
                                                                {translateUserRole(
                                                                    selectedUser.role,
                                                                )}
                                                            </p>
                                                            {selectedUser.phone && (
                                                                <p>
                                                                    <span className="font-medium">
                                                                        Телефон:
                                                                    </span>{' '}
                                                                    {selectedUser.phone}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        )}
                                    </div>
                                    {error && (
                                        <p className="text-sm text-red-600">{error.message}</p>
                                    )}
                                </div>
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
                                    field.value
                                        ?.map((item) => ({
                                            value: item?.id || '',
                                            label: item?.label || '',
                                        }))
                                        .filter((item) => item.value && item.label) || []
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
                                    field.value
                                        ?.map((item) => ({
                                            value: item?.id || '',
                                            label: item?.label || '',
                                        }))
                                        .filter((item) => item.value && item.label) || []
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
                        onClose={onClose}
                        // @ts-expect-error - SubmitHandler type mismatch between form and component
                        onAccept={handleSubmit(onAcceptForm, onError)}
                    />
                </div>
            </form>
        </FormProvider>
    );
};
