import MultipleSelector from '@/components/ui/multiple-selector';
import { TRAVEL_TIME_DEFAULTS } from '@/features/AdvancedFilters/lib/constants';
import { HOTEL_TYPES } from '@/features/HotelModal/lib/const';
import { TravelUser } from '@/shared/api/auth/auth';
import { CreateHotelDTO, Hotel, HotelDTO } from '@/shared/api/hotel/hotel';
import { CurrentReserveType, Nullable } from '@/shared/api/reserve/reserve';
import { adaptToOption } from '@/shared/lib/adaptHotel';
import { translateUserRole } from '@/shared/lib/translateUser';
import { FormButtons } from '@/shared/ui/FormButtons/FormButtons';
import { LinkIcon } from '@/shared/ui/LinkIcon/LinkIcon';
import { PhoneInput } from '@/shared/ui/PhoneInput/PhoneInput';
import { showToast } from '@/shared/ui/Toast/Toast';
import cn from 'classnames';
import { FC, useCallback, useMemo } from 'react';
import { Controller, SubmitErrorHandler, useForm } from 'react-hook-form';
import { FaTelegram } from 'react-icons/fa';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { HotelFormSchema } from '../lib/validation';
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
            ? hotel?.features.map((item) => adaptToOption({ title: item, id: item }))
            : undefined,
        eat: hotel?.eat
            ? hotel?.eat.map((item) => adaptToOption({ title: item, id: item }))
            : undefined,
        city: hotel?.city ? adaptToOption({ title: hotel?.city, id: hotel?.city }) : undefined,
    };
};

const deserializeData = (data: HotelFormSchema): Hotel | CreateHotelDTO => {
    const hotelData = {
        ...data,
        type: data.type.label,
        rating: +data.rating,
        user_id: data.user_id.id,
        description: data.description || '',
        beach: data.beach.id,
        beach_distance: data.beach_distance.map((item) => item.id),
        features: data.features.id,
        eat: data.eat.id,
        city: data.city.id,
    };

    if (data.id) {
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
    const {
        control,
        getValues,
        handleSubmit,
        watch,
        trigger,
        formState: { errors },
    } = useForm<HotelFormSchema>({
        defaultValues: getInitialValue(currentReserve?.hotel),
        mode: 'onBlur',
        reValidateMode: 'onBlur',
        // resolver: zodResolver(hotelFor`mSchema),
    });

    const userOptions = useMemo(() => {
        return users?.map((user) =>
            adaptToOption({
                title: `${translateUserRole(user?.role).toLowerCase()} ${user?.name} ${user?.surname}, ${user?.email}  `,
                id: user?.sub,
            }),
        );
    }, [users]);

    const formData = watch();

    const onAcceptForm = useCallback(async () => {
        const isValid = await trigger();

        if (!isValid) {
            const errorsTmp = Object.values(errors)
                .map((error) => error?.message)
                .join(', ');
            showToast(`${errorsTmp}`, 'error');
            return;
        }
        const formData = getValues();

        const serializedData = deserializeData({
            ...formData,
        });

        await onAccept(serializedData);
    }, [getValues, onAccept, trigger, errors]);

    const onError: SubmitErrorHandler<HotelFormSchema> = () => {
        showToast(`Заполните все обязательные поля`, 'error');
        return;
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-2">
                <Controller
                    name="title"
                    control={control}
                    rules={{ required: 'Название отеля обязательно для заполнения' }}
                    render={({ field, fieldState: { error } }) => (
                        <div className="space-y-2">
                            <Label htmlFor="title">
                                Название отеля <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                {...field}
                                id="title"
                                placeholder="Введите название"
                                disabled={isLoading}
                                className={cx.fields}
                            />
                            {error && <p className="text-sm text-destructive">{error.message}</p>}
                        </div>
                    )}
                />

                <Controller
                    name="type"
                    control={control}
                    rules={{ required: 'Тип отеля обязателен для заполнения' }}
                    render={({ field, fieldState: { error } }) => (
                        <div className="space-y-2">
                            <Label htmlFor="type">
                                Тип <span className="text-destructive">*</span>
                            </Label>
                            <Select
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
                                disabled={isLoading}
                            >
                                <SelectTrigger className={cx.fields}>
                                    <SelectValue placeholder="Выберите из списка" />
                                </SelectTrigger>
                                <SelectContent>
                                    {HOTEL_TYPES.map((type) => (
                                        <SelectItem key={type.value} value={type.value}>
                                            {type.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {error && <p className="text-sm text-destructive">{error.message}</p>}
                        </div>
                    )}
                />
            </div>
            <Controller
                control={control}
                name="city"
                rules={{ required: 'Город обязателен для заполнения' }}
                render={({ field }) => (
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Город <span className="text-destructive">*</span>
                        </label>
                        <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={isLoading}
                        >
                            <SelectTrigger className={cx.fields}>
                                <SelectValue placeholder="Выберите город" />
                            </SelectTrigger>
                            <SelectContent>
                                {TRAVEL_TIME_DEFAULTS.city.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.city && (
                            <p className="text-sm text-destructive">{errors.city.message}</p>
                        )}
                    </div>
                )}
            />
            <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-2">
                <Controller
                    name="address"
                    control={control}
                    rules={{ required: 'Адрес обязателен для заполнения' }}
                    render={({ field, fieldState: { error } }) => (
                        <div className="space-y-2">
                            <Label htmlFor="address">
                                Местоположение <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                {...field}
                                id="address"
                                placeholder="Введите адрес"
                                disabled={isLoading}
                                className={cx.fields}
                            />
                            {error && <p className="text-sm text-destructive">{error.message}</p>}
                        </div>
                    )}
                />

                <Controller
                    name="telegram_url"
                    control={control}
                    render={({ field }) => (
                        <div className="space-y-2">
                            <Label htmlFor="telegram_url">Ссылка на отель в Telegram</Label>
                            <div className="relative">
                                <Input
                                    {...field}
                                    id="telegram_url"
                                    placeholder="Вставьте ссылку"
                                    disabled={isLoading}
                                    className={cx.fields}
                                />
                                {formData?.telegram_url && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <LinkIcon
                                            icon={<FaTelegram color="2AABEE" size={'24px'} />}
                                            link={formData?.telegram_url}
                                        />
                                    </div>
                                )}
                            </div>
                            {errors.telegram_url && (
                                <p className="text-sm text-destructive">
                                    {errors.telegram_url.message}
                                </p>
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
                    className={cx.fields}
                    error={errors.phone?.message}
                />
                <Controller
                    name="user_id"
                    control={control}
                    rules={{ required: 'Отельер обязателен для заполнения' }}
                    render={({ field, fieldState: { error } }) => (
                        <div className="space-y-2">
                            <Label htmlFor="user_id">
                                Отельер <span className="text-destructive">*</span>
                            </Label>
                            <Select
                                value={field.value?.id}
                                onValueChange={(value) => {
                                    const selectedUser = userOptions?.find(
                                        (user) => user.id === value,
                                    );
                                    field.onChange(selectedUser);
                                }}
                                disabled={isLoading}
                            >
                                <SelectTrigger className={cx.fields}>
                                    <SelectValue placeholder="Выберите отельера" />
                                </SelectTrigger>
                                <SelectContent>
                                    {userOptions?.map((user) => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {error && <p className="text-sm text-destructive">{error.message}</p>}
                        </div>
                    )}
                />
            </div>
            <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-2">
                <Controller
                    name="beach"
                    control={control}
                    render={({ field }) => (
                        <div className="space-y-2">
                            <Label htmlFor="beach">Пляж</Label>
                            <Select
                                value={field.value}
                                onValueChange={field.onChange}
                                disabled={isLoading}
                            >
                                <SelectTrigger className={cx.fields}>
                                    <SelectValue placeholder="Выберите пляж" />
                                    <SelectContent>
                                        {TRAVEL_TIME_DEFAULTS.beach.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </SelectTrigger>
                            </Select>
                        </div>
                    )}
                />
                <Controller
                    name="beach_distance"
                    control={control}
                    render={({ field }) => (
                        <div className="space-y-2">
                            <Label htmlFor="beach_distance">Расстояние до пляжа</Label>
                            <Select
                                value={field.value}
                                onValueChange={field.onChange}
                                disabled={isLoading}
                            >
                                <SelectTrigger className={cx.fields}>
                                    <SelectValue placeholder="Выберите расстояние до пляжа" />
                                    <SelectContent>
                                        {TRAVEL_TIME_DEFAULTS.beach_distance.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </SelectTrigger>
                            </Select>
                        </div>
                    )}
                />
            </div>
            <Controller
                name="features"
                control={control}
                render={({ field }) => (
                    <div className="space-y-2">
                        <Label htmlFor="features">Особенности</Label>
                        <MultipleSelector
                            options={TRAVEL_TIME_DEFAULTS.features}
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={isLoading}
                            hidePlaceholderWhenSelected
                            placeholder="Выберите особенности размещения"
                        />
                    </div>
                )}
            />
            <Controller
                name="description"
                control={control}
                render={({ field }) => (
                    <div className="space-y-2">
                        <Label htmlFor="description">Комментарии</Label>
                        <Textarea
                            {...field}
                            id="description"
                            placeholder="Введите комментарий"
                            disabled={isLoading}
                            className={cn(cx.fields, cx.description)}
                            rows={3}
                        />
                        {errors.description && (
                            <p className="text-sm text-destructive">{errors.description.message}</p>
                        )}
                    </div>
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
    );
};
