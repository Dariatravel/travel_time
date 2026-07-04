import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { buildFallbackReserveHistory } from '@/features/ReserveInfo/lib/formatReserveHistory';
import {
    getReserveFormDefaultDates,
    isValidReserveFormPeriod,
    resolveReserveDateRangeSelection,
    serializeReserveFormDates,
} from '@/features/ReserveInfo/lib/reserveDateForm';
import { ReserveHistory } from '@/features/ReserveInfo/ui/ReserveHistory';
import { ReserveTotal } from '@/features/ReserveInfo/ui/ReserveTotal';
import { FormButtons, PhoneInput } from '@/shared';
import { useGetHotelsForRoom } from '@/shared/api/hotel/hotel';
import {
    type CurrentReserveType,
    getReserveOverlaps,
    Nullable,
    Reserve,
    ReserveDTO,
    ReserveForm,
    useReserveHistory,
} from '@/shared/api/reserve/reserve';
import { useGetRoomsByHotel } from '@/shared/api/room/room';
import { adaptToOption } from '@/shared/lib/adaptHotel';
import { getDate } from '@/shared/lib/getDate';
import { $user } from '@/shared/models/auth';
import { Datepicker } from '@/shared/ui/Datepicker/Datepicker';
import { FormMessage } from '@/shared/ui/FormMessage';
import { showToast } from '@/shared/ui/Toast/Toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUnit } from 'effector-react/compat';
import { FC, useCallback, useEffect, useId, useMemo } from 'react';
import { Controller, FieldErrors, FormProvider, SubmitErrorHandler, useForm } from 'react-hook-form';
import { z } from 'zod';
import cx from './style.module.scss';

type ReserveFormValues = Omit<ReserveForm, 'prepayment' | 'phone' | 'comment'> & {
    phone?: string | null;
    comment?: string | null;
    prepayment?: number | string | null;
};

export interface ReserveInfoProps {
    onClose: () => void;
    onAccept: (reserve: Reserve | ReserveDTO) => void;
    currentReserve?: Nullable<CurrentReserveType>;
    isLoading: boolean;
    isEdit?: boolean;
    onDelete?: (id: string) => void;
    isOpen?: boolean; // Для контроля выполнения запросов только при открытой форме
}

// Схема валидации Zod. При редактировании допускаем legacy-значения,
// которые уже есть в старых бронях и не должны блокировать сохранение.
const getFirstFormErrorMessage = (errors: FieldErrors<ReserveFormValues>): string | undefined => {
    for (const value of Object.values(errors)) {
        if (!value) continue;

        if (typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
            return value.message;
        }

        if (typeof value === 'object') {
            const nested = getFirstFormErrorMessage(value as FieldErrors<ReserveFormValues>);
            if (nested) {
                return nested;
            }
        }
    }

    return undefined;
};

const formatOverlapDate = (value: number | Date) => {
    const unix = typeof value === 'number' ? value : Math.floor(value.getTime() / 1000);
    return new Date(unix * 1000).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
};

const createReserveFormSchema = (allowLegacyValues: boolean) => z.object({
    date: z.tuple([z.date(), z.date()], { message: 'Дата обязательна' }).refine(
        (dates) => isValidReserveFormPeriod(dates[0], dates[1]),
        {
            message: 'Дата выезда должна быть позже даты заезда',
        },
    ),
    hotel_id: z
        .object({
            id: z.string().min(1),
            label: z.string(),
        })
        .optional(), // hotel_id используется только для UI, не валидируется как обязательное
    room_id: z.object(
        {
            id: z.string({ message: 'Номер обязателен' }).min(1, 'Номер обязателен'),
            label: z.string(),
        },
        { message: 'Номер обязателен' },
    ),
    price: z.coerce
        .number({
            required_error: 'Стоимость обязательна',
            invalid_type_error: 'Стоимость должна быть числом',
        })
        .refine(
            (value) => (allowLegacyValues ? value >= 0 : value > 0),
            allowLegacyValues
                ? 'Стоимость не может быть отрицательной'
                : 'Стоимость должна быть больше 0',
        ),
    quantity: z.coerce
        .number({
            required_error: 'Количество гостей обязательно',
            invalid_type_error: 'Количество должно быть числом',
        })
        .int('Количество гостей должно быть целым числом')
        .refine(
            (value) => (allowLegacyValues ? value >= 0 : value > 0),
            allowLegacyValues
                ? 'Количество гостей не может быть отрицательным'
                : 'Должно быть больше 0',
        ),
    guest: z
        .string({ message: 'ФИО гостя обязательно' })
        .trim()
        .min(
            allowLegacyValues ? 1 : 2,
            allowLegacyValues
                ? 'ФИО гостя обязательно'
                : 'ФИО гостя должно содержать минимум 2 символа',
        ),
    phone: z
        .union([z.string(), z.null(), z.undefined()])
        .transform((value) => value?.trim() ?? '')
        .refine((value) => allowLegacyValues || value.length > 0, {
            message: 'Номер телефона обязателен',
        }),
    comment: z
        .any()
        .optional()
        .transform((value) => (value == null ? '' : String(value))),
    prepayment: z
        .union([z.number(), z.string(), z.null(), z.undefined()])
        .transform((value) => {
            if (allowLegacyValues && (value === '' || value == null)) {
                return 0;
            }

            return Number(value);
        })
        .refine((value) => !Number.isNaN(value), {
            message: allowLegacyValues ? 'Сумма должна быть числом' : 'Укажите сумму предоплаты',
        })
        .refine((value) => value >= 0, {
            message: 'Сумма не может быть отрицательной',
        }),
    created_by: z.string().optional(),
    edited_by: z.string().optional(),
    created_at: z.string().optional(),
    edited_at: z.string().optional(),
});

export const ReserveInfo: FC<ReserveInfoProps> = (props) => {
    const formKey = props.isEdit
        ? `edit-${props.currentReserve?.reserve?.id ?? 'unknown'}`
        : 'create';

    return <ReserveInfoForm key={formKey} {...props} />;
};

const ReserveInfoForm: FC<ReserveInfoProps> = ({
    onAccept,
    onClose,
    onDelete,
    currentReserve,
    isLoading,
    isEdit,
    isOpen = true, // По умолчанию форма открыта
}: ReserveInfoProps) => {
    const reserveFormId = useId();
    const shouldLoadHotels = isOpen && !currentReserve?.hotel?.id;
    const shouldLoadRooms = isOpen;

    // Выполняем запросы только когда форма открыта
    const {
        data: hotels,
        isLoading: isHotelsLoading,
        status: hotelsStatus,
    } = useGetHotelsForRoom(shouldLoadHotels);

    const user = useUnit($user);
    const getReserveDefaults = ({
        price,
        prepayment,
        guest,
        phone,
        comment,
        quantity,
    }: Partial<ReserveDTO>) => {
        return {
            price,
            prepayment: prepayment ?? 0,
            guest,
            phone: phone ?? '',
            comment: comment ?? '', // Если нет комментария, пустая строка
            quantity: quantity ?? 2,
        };
    };
    // Мемоизируем getDefaultValues, чтобы не пересчитывать при каждом рендере
    const getDefaultValues = useCallback(
        (reserveContext?: Nullable<CurrentReserveType>): Partial<ReserveFormValues> => {
            const { reserve, room, hotel } = reserveContext ?? {};

            const [startDate, endDate] = getReserveFormDefaultDates(reserve);

            let defaults: Partial<ReserveFormValues> = {
                date: [startDate, endDate],
                // hotel_id используется только для выбора отеля и загрузки номеров, не сохраняется в резерве
                hotel_id: hotel
                    ? adaptToOption({
                          id: hotel?.id,
                          title: hotel?.title,
                      })
                    : undefined,
                room_id: room
                    ? adaptToOption({
                          id: room?.id,
                          title: room?.title,
                      })
                    : reserve?.room_id
                      ? {
                            id: reserve.room_id,
                            label: 'Текущий номер',
                        }
                      : undefined,
                price: room?.price ?? 0,
                quantity: room?.quantity ?? 2,
                comment: '', // По умолчанию пустая строка
                created_by: reserveContext?.reserve?.created_by,
                edited_by: reserveContext?.reserve?.edited_by,
                created_at: reserveContext?.reserve?.created_at,
                edited_at: reserveContext?.reserve?.edited_at,
            };

            if (!!reserve) {
                const reserveDefaults = getReserveDefaults(reserve);
                defaults = {
                    ...defaults,
                    ...reserveDefaults,
                    // Даты уже установлены выше из reserve.start и reserve.end, не перезаписываем их
                    date: [startDate, endDate],
                    quantity: reserveDefaults.quantity ?? defaults.quantity,
                    comment: reserveDefaults.comment ?? defaults.comment ?? '', // Гарантируем строку
                };
            }

            return defaults;
        },
        [],
    );

    // Мемоизируем defaultValues, чтобы не пересчитывать при каждом рендере
    const defaultValues = useMemo(() => {
        return getDefaultValues(currentReserve);
    }, [currentReserve, getDefaultValues]);
    const reserveFormSchema = useMemo(() => createReserveFormSchema(!!isEdit), [isEdit]);

    const form = useForm<ReserveFormValues>({
        resolver: zodResolver(reserveFormSchema),
        mode: 'onChange',
        defaultValues,
    });

    useEffect(() => {
        if (isOpen) {
            form.reset(defaultValues);
        }
    }, [defaultValues, form, isOpen]);

    const {
        control,
        watch,
        setValue,
        formState: { errors },
        handleSubmit,
    } = form;

    // Оптимизация: отслеживаем только нужные поля вместо всех
    const hotelId = watch('hotel_id');
    const roomId = watch('room_id');
    const date = watch('date');
    const price = watch('price');
    const prepayment = watch('prepayment');
    const prepaymentAmount =
        prepayment === '' || prepayment == null ? 0 : Number(prepayment) || 0;

    const {
        data: rooms,
        isLoading: isRoomsLoading,
        refetch: fetchRoomsByHotel,
    } = useGetRoomsByHotel(hotelId?.id, false);

    const hotelOptions = useMemo(() => {
        const hotelsTmp = hotels?.map(adaptToOption) ?? [];
        const currentHotel = currentReserve?.hotel ? adaptToOption(currentReserve.hotel) : undefined;

        if (currentHotel && !hotelsTmp.some((hotel) => hotel.id === currentHotel.id)) {
            return [currentHotel, ...hotelsTmp];
        }

        return hotelsTmp;
    }, [hotels, currentReserve?.hotel]);

    const roomOptions = useMemo(() => {
        const roomsTmp = rooms?.map(adaptToOption) ?? [];
        const currentRoom = currentReserve?.room ? adaptToOption(currentReserve.room) : undefined;

        if (currentRoom && !roomsTmp.some((room) => room.id === currentRoom.id)) {
            return [currentRoom, ...roomsTmp];
        }

        return roomsTmp;
    }, [rooms, currentReserve?.room]);

    useEffect(() => {
        // Не выполняем запросы, если форма закрыта
        if (!isOpen) return;

        if ((hotelsStatus === 'success' || !shouldLoadHotels) && hotelId?.id && shouldLoadRooms) {
            fetchRoomsByHotel();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hotelsStatus, hotelId?.id, isOpen, shouldLoadHotels, shouldLoadRooms]);

    useEffect(() => {
        // если комнат нет - выходим
        if (rooms?.length === 0 || !!currentReserve?.reserve?.price) return;

        const room = rooms?.find((r) => r.id === roomId?.id);

        if (room) {
            setValue('price', room.price);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId?.id]);

    const loading = isLoading;
    const lookupLoading = isHotelsLoading || isRoomsLoading;
    const reserveId = currentReserve?.reserve?.id;
    const { data: historyRows, isPending: isHistoryPending } = useReserveHistory(
        reserveId,
        isEdit && isOpen,
    );

    const historyEntries = useMemo(() => {
        if (historyRows && historyRows.length > 0) {
            return historyRows;
        }

        return buildFallbackReserveHistory(currentReserve?.reserve);
    }, [historyRows, currentReserve?.reserve]);

    // Мемоизируем функцию deserializeData, чтобы не создавать её при каждом рендере
    const deserializeData = useCallback(
        ({ date, price, quantity, prepayment = 0, comment, ...data }: ReserveFormValues) => {
            const { start, end } = serializeReserveFormDates(date);
            const userName = `${user?.name} ${user?.surname}`;
            const room_id = data.room_id?.id;
            const priceNumber = +price;
            const quantityNumber = +quantity;
            const prepaymentNumber = prepayment == null || prepayment === '' ? 0 : +prepayment;
            const isEditReserve = !!currentReserve?.reserve?.id;
            const created_by = data?.created_by ?? userName;
            const created_at = data?.created_at ?? getDate();
            const edited_by = isEditReserve ? userName : undefined;
            const edited_at = isEditReserve ? getDate() : undefined;

            // Обрабатываем comment: если значение не задано, отправляем пустую строку ""
            const commentValue =
                comment != null && String(comment).trim() !== '' ? String(comment).trim() : '';

            return {
                room_id,
                start,
                end,
                guest: data.guest,
                phone: data.phone?.trim() ?? '',
                price: priceNumber,
                quantity: quantityNumber,
                prepayment: prepaymentNumber,
                comment: commentValue,
                created_by,
                edited_by,
                created_at,
                edited_at,
            };
        },
        [currentReserve?.reserve?.id, user],
    );

    // Мемоизируем обработчики событий
    const onAcceptForm = useCallback(
        async (formData: ReserveFormValues) => {
            if (!formData?.date?.[0] || !formData?.date?.[1]) {
                showToast('Ошибка при сохранении брони, проверьте даты', 'error');
                return;
            }

            const reserveId = currentReserve?.reserve?.id;
            const data = deserializeData(formData);
            const roomId = data.room_id;

            if (!roomId) {
                showToast('Ошибка при сохранении брони, выберите номер', 'error');
                return;
            }

            try {
                const overlaps = await getReserveOverlaps({
                    roomId,
                    start: data.start as number,
                    end: data.end as number,
                    excludeReserveId: reserveId,
                });

                if (overlaps.length > 0) {
                    const overlapMessage = overlaps
                        .map(
                            (reserve) =>
                                `• ${reserve.guest || 'Без имени'}: ${formatOverlapDate(reserve.start)} - ${formatOverlapDate(reserve.end)}`,
                        )
                        .join('\n');
                    const shouldContinue = window.confirm(
                        `В выбранном номере уже есть бронь на эти даты:\n\n${overlapMessage}\n\nВсё равно сохранить?`,
                    );

                    if (!shouldContinue) {
                        return;
                    }
                }
            } catch (error) {
                showToast(
                    `Не удалось проверить пересечения: ${(error as Error).message}`,
                    'error',
                );
                return;
            }

            if (reserveId) {
                onAccept({ ...data, id: reserveId });
                return;
            }

            onAccept(data);
        },
        [currentReserve?.reserve?.id, deserializeData, onAccept],
    );

    const onError: SubmitErrorHandler<ReserveFormValues> = useCallback((formErrors) => {
        const firstError = getFirstFormErrorMessage(formErrors);
        showToast(firstError || 'Заполните все обязательные поля', 'error');
    }, []);
    const submitReserveForm = handleSubmit(onAcceptForm, onError);

    const onReserveDelete = useCallback(() => {
        if (!currentReserve?.reserve?.id || !onDelete) {
            showToast('Ошибка во время удаления брони, отсутсвует id', 'error');
            return;
        }

        onDelete(currentReserve.reserve.id);
    }, [currentReserve, onDelete]);
    return (
        <FormProvider {...form}>
            <form
                id={reserveFormId}
                className="flex h-full flex-col"
                onSubmit={submitReserveForm}
                noValidate
            >
                <div className="flex-1 overflow-y-auto px-1 sm:px-1">
                    <div className="flex-1 space-y-1">
                            <Controller
                                name="date"
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                    <>
                                        <Datepicker
                                            selected={
                                                field.value
                                                    ? {
                                                          from: field.value[0],
                                                          to: field.value[1],
                                                      }
                                                    : undefined
                                            }
                                            onSelect={(range) => {
                                                const nextRange = resolveReserveDateRangeSelection(
                                                    range,
                                                    field.value,
                                                );

                                                if (nextRange) {
                                                    field.onChange(nextRange);
                                                    return;
                                                }

                                                field.onChange(undefined);
                                            }}
                                            label="Период бронирования"
                                            numberOfMonths={2}
                                            defaultMonth={field.value?.[0] || new Date()}
                                        />
                                        <FormMessage message={error?.message} />
                                    </>
                                )}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <Controller
                                    name="hotel_id"
                                    control={control}
                                    render={({ field, fieldState: { error } }) => (
                                        <div className="space-y-2">
                                            <Label htmlFor="hotel_id">
                                                Название отеля{' '}
                                                <span className="text-red-500">*</span>
                                            </Label>
                                            <Select
                                                value={field.value?.id}
                                                onValueChange={(value) => {
                                                    const selectedHotel = hotelOptions.find(
                                                        (hotel) => hotel.id === value,
                                                    );
                                                    if (selectedHotel) {
                                                        field.onChange(selectedHotel);
                                                        setValue(
                                                            'room_id',
                                                            undefined as unknown as ReserveFormValues['room_id'],
                                                        );
                                                    }
                                                }}
                                                disabled={lookupLoading || !!currentReserve?.hotel?.id}
                                            >
                                                <SelectTrigger className={cx.fields}>
                                                    <SelectValue placeholder="Выберите из списка" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {hotelOptions.map((hotel) => (
                                                        <SelectItem key={hotel.id} value={hotel.id}>
                                                            {hotel.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {error?.message && (
                                                <p className="text-sm text-red-500">
                                                    {error.message}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                />
                                <Controller
                                    name="room_id"
                                    control={control}
                                    render={({ field, fieldState: { error } }) => (
                                        <div className="space-y-2">
                                            <Label htmlFor="room_id">
                                                Номер <span className="text-red-500">*</span>
                                            </Label>
                                            <Select
                                                value={field.value?.id}
                                                onValueChange={(value) => {
                                                    const selectedRoom = roomOptions.find(
                                                        (room) => room.id === value,
                                                    );
                                                    if (selectedRoom) {
                                                        field.onChange(selectedRoom);
                                                    }
                                                }}
                                                disabled={lookupLoading}
                                            >
                                                <SelectTrigger className={cx.fields}>
                                                    <SelectValue placeholder="Выберите из списка" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {roomOptions.map((room) => (
                                                        <SelectItem key={room.id} value={room.id}>
                                                            {room.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {error?.message && (
                                                <p className="text-sm text-red-500">
                                                    {error.message}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <Controller
                                    name="price"
                                    control={control}
                                    render={({ field, fieldState: { error } }) => (
                                        <div className="space-y-2">
                                            <Label htmlFor="price">
                                                Стоимость номера{' '}
                                                <span className="text-red-500">*</span>
                                            </Label>
                                            <Input
                                                {...field}
                                                id="price"
                                                type="number"
                                                placeholder="Введите стоимость"
                                                className={cx.fields}
                                                value={String(field.value)}
                                                onChange={field.onChange}
                                            />
                                            {error?.message && (
                                                <p className="text-sm text-red-500">
                                                    {error.message}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                />
                                <Controller
                                    name="quantity"
                                    control={control}
                                    render={({ field, fieldState: { error } }) => (
                                        <div className="space-y-2">
                                            <Label htmlFor="quantity">
                                                Кол-во
                                                <span className="text-red-500">*</span>
                                            </Label>
                                            <Input
                                                {...field}
                                                id="quantity"
                                                type="number"
                                                placeholder="Введите число"
                                                className={cx.fields}
                                                value={field.value?.toString() ?? ''}
                                            />
                                            {error?.message && (
                                                <p className="text-sm text-red-500">
                                                    {error.message}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                />
                            </div>
                            <Controller
                                name="guest"
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                    <div className="space-y-2">
                                        <Label htmlFor="guest">
                                            ФИО гостя <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            {...field}
                                            id="guest"
                                            placeholder="Введите ФИО"
                                            className={cx.fields}
                                        />
                                        <FormMessage message={error?.message} />
                                    </div>
                                )}
                            />

                            <div className="space-y-1">
                                <PhoneInput
                                    control={control}
                                    name="phone"
                                    placeholder="+7 (...)"
                                    required
                                    label="Номер гостя"
                                    className={cx.fields}
                                    error={errors.phone?.message}
                                    showWhatsapp
                                />
                                <FormMessage message={errors.phone?.message} />
                            </div>

                            <Controller
                                name="comment"
                                control={control}
                                render={({ field }) => (
                                    <div className="space-y-2">
                                        <Label htmlFor="comment">
                                            Комментарии{' '}
                                            <span className="text-muted-foreground font-normal">
                                                (необязательно)
                                            </span>
                                        </Label>
                                        <Textarea
                                            {...field}
                                            id="comment"
                                            className={cx.fields}
                                            placeholder="Введите комментарий"
                                            rows={2}
                                            value={field.value ?? ''}
                                        />
                                    </div>
                                )}
                            />

                            <ReserveTotal
                                date={date}
                                price={price}
                                prepayment={prepaymentAmount}
                                className={cx.fields}
                                Prepayment={
                                    <Controller
                                        name="prepayment"
                                        control={control}
                                        render={({ field, fieldState: { error } }) => (
                                            <div className="space-y-1">
                                                <Input
                                                    {...field}
                                                    className={cx.fields}
                                                    disabled={lookupLoading}
                                                    value={
                                                        field.value === '' || field.value == null
                                                            ? ''
                                                            : String(field.value)
                                                    }
                                                    onChange={(event) => {
                                                        const nextValue = event.target.value;
                                                        field.onChange(
                                                            nextValue === '' ? '' : nextValue,
                                                        );
                                                    }}
                                                    type="number"
                                                    min={0}
                                                />
                                                <FormMessage message={error?.message} />
                                            </div>
                                        )}
                                    />
                                }
                            />
                    </div>
                </div>
                <div className="w-full space-y-2">
                    <FormButtons
                        className={cx.buttons}
                        onDelete={onReserveDelete}
                        deleteText={'Удалить бронь'}
                        isEdit={isEdit}
                        isLoading={loading}
                        onClose={onClose}
                        formId={reserveFormId}
                    />
                    {isEdit && (
                        <ReserveHistory
                            entries={historyEntries}
                            isLoading={isHistoryPending}
                        />
                    )}
                </div>
            </form>
        </FormProvider>
    );
};
