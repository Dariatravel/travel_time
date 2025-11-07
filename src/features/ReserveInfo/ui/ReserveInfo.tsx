import { FormTitle } from '@/components/ui/form-title';
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
import { ReserveTotal } from '@/features/ReserveInfo/ui/ReserveTotal';
import { FormButtons, PhoneInput } from '@/shared';
import { useGetHotelsForRoom } from '@/shared/api/hotel/hotel';
import {
    type CurrentReserveType,
    Nullable,
    Reserve,
    ReserveDTO,
    ReserveForm,
} from '@/shared/api/reserve/reserve';
import { useGetRoomsByHotel } from '@/shared/api/room/room';
import { adaptToOption } from '@/shared/lib/adaptHotel';
import { getDate } from '@/shared/lib/getDate';
import { $user } from '@/shared/models/auth';
import { Datepicker } from '@/shared/ui/Datepicker/Datepicker';
import { FormMessage } from '@/shared/ui/FormMessage';
import { showToast } from '@/shared/ui/Toast/Toast';
import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import { useUnit } from 'effector-react/compat';
import moment from 'moment';
import { FC, useCallback, useEffect, useMemo } from 'react';
import { Controller, FormProvider, SubmitErrorHandler, useForm } from 'react-hook-form';
import { z } from 'zod';
import cx from './style.module.scss';

export interface ReserveInfoProps {
    onClose: () => void;
    onAccept: (reserve: Reserve | ReserveDTO) => void;
    currentReserve?: Nullable<CurrentReserveType>;
    isLoading: boolean;
    isEdit?: boolean;
    onDelete?: (id: string) => void;
    isOpen?: boolean; // Для контроля выполнения запросов только при открытой форме
}

// Схема валидации Zod
const reserveFormSchema = z.object({
    date: z.tuple([z.date(), z.date()], { message: 'Дата обязательна' }).refine(
        (dates) => {
            const [start, end] = dates;
            return start && end && start <= end;
        },
        {
            message: 'Дата начала должна быть меньше или равна дате окончания',
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
        .positive('Стоимость должна быть больше 0'),
    quantity: z.coerce
        .number({
            required_error: 'Количество гостей обязательно',
            invalid_type_error: 'Количество должно быть числом',
        })
        .positive('Должно быть больше 0')
        .int('Количество гостей должно быть целым числом'),
    guest: z
        .string({ message: 'ФИО гостя обязательно' })
        .min(2, 'ФИО гостя должно содержать минимум 2 символа'),
    phone: z
        .string({ message: 'Номер телефона обязателен' })
        .min(1, 'Номер телефона обязателен')
        .regex(/^\+7\(\d{3}\)\d{3}-\d{2}-\d{2}$/, 'Введите корректный номер телефона'),
    comment: z.string().optional(),
    prepayment: z.coerce.number().optional(),
    created_by: z.string().optional(),
    edited_by: z.string().optional(),
    created_at: z.string().optional(),
    edited_at: z.string().optional(),
}) satisfies z.ZodType<ReserveForm>;

export const ReserveInfo: FC<ReserveInfoProps> = ({
    onAccept,
    onClose,
    onDelete,
    currentReserve,
    isLoading,
    isEdit,
    isOpen = true, // По умолчанию форма открыта
}: ReserveInfoProps) => {
    // Выполняем запросы только когда форма открыта
    const {
        data: hotels,
        isLoading: isHotelsLoading,
        status: hotelsStatus,
    } = useGetHotelsForRoom();

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
            phone,
            comment: comment ?? '', // Если нет комментария, пустая строка
            quantity: quantity ?? 2,
        };
    };
    // Мемоизируем getDefaultValues, чтобы не пересчитывать при каждом рендере
    const getDefaultValues = useCallback(
        (currentReserve?: Nullable<CurrentReserveType>): Partial<ReserveForm> => {
            const { reserve, room, hotel } = currentReserve ?? {};

            // По умолчанию: с сегодня до завтра (1 сутка)
            const today = moment().startOf('day').toDate();
            const tomorrow = moment().add(1, 'day').startOf('day').toDate();

            const startDate = reserve?.start ? moment(reserve?.start).toDate() : today;
            const endDate = reserve?.end ? moment(reserve?.end).startOf('day').toDate() : tomorrow;

            let defaults: Partial<ReserveForm> = {
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
                    : undefined,
                price: room?.price ?? 0,
                quantity: room?.quantity ?? 2,
                comment: '', // По умолчанию пустая строка
                created_by: currentReserve?.reserve?.created_by,
                edited_by: currentReserve?.reserve?.edited_by,
                created_at: currentReserve?.reserve?.created_at,
                edited_at: currentReserve?.reserve?.edited_at,
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
        [currentReserve],
    );

    // Мемоизируем defaultValues, чтобы не пересчитывать при каждом рендере
    const defaultValues = useMemo(() => {
        return getDefaultValues(currentReserve);
    }, [currentReserve, getDefaultValues]);

    const form = useForm<ReserveForm>({
        resolver: zodResolver(reserveFormSchema),
        mode: 'onChange',
        defaultValues,
    });

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
    const created_at = watch('created_at');
    const edited_at = watch('edited_at');
    const created_by = watch('created_by');
    const edited_by = watch('edited_by');

    // Создаем объект formData только для компонентов, которым нужны все данные
    // hotel_id не включаем, так как он не используется в резерве
    const formData = useMemo(
        () => ({
            room_id: roomId,
            date,
            price,
            prepayment,
            created_at,
            edited_at,
            created_by,
            edited_by,
        }),
        [roomId, date, price, prepayment, created_at, edited_at, created_by, edited_by],
    );

    const {
        data: rooms,
        isLoading: isRoomsLoading,
        refetch: fetchRoomsByHotel,
    } = useGetRoomsByHotel(hotelId?.id, false);

    const hotelOptions = useMemo(() => {
        const hotelsTmp = hotels?.map(adaptToOption);

        return hotelsTmp ?? [];
    }, [hotels]);

    const roomOptions = useMemo(() => {
        const hotelsTmp = rooms?.map(adaptToOption);

        return hotelsTmp ?? [];
    }, [rooms]);

    useEffect(() => {
        // Не выполняем запросы, если форма закрыта
        if (!isOpen) return;

        if (hotelsStatus === 'success' && hotelId?.id) {
            fetchRoomsByHotel();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hotelsStatus, hotelId?.id, isOpen]);

    useEffect(() => {
        // если комнат нет - выходим
        if (rooms?.length === 0 || !!currentReserve?.reserve?.price) return;

        const room = rooms?.find((r) => r.id === roomId?.id);

        if (room) {
            setValue('price', room.price);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId?.id]);

    const loading = isLoading || isHotelsLoading;

    // Мемоизируем функцию deserializeData, чтобы не создавать её при каждом рендере
    const deserializeData = useCallback(
        ({ date, price, quantity, prepayment = 0, comment, hotel_id: _, ...data }: ReserveForm) => {
            const start = moment(date[0]).hour(12).unix();
            const userName = `${user?.name} ${user?.surname}`;
            const end = moment(date[1]).hour(11).unix();
            const room_id = data.room_id?.id;
            const priceNumber = +price;
            const quantityNumber = +quantity;
            const prepaymentNumber = +prepayment;
            const created_by = data?.created_by ?? userName;
            const edited_by = userName;
            const created_at = data?.created_at ?? getDate();
            const edited_at = data?.edited_at ?? getDate();

            // Обрабатываем comment: если значение не задано, отправляем пустую строку ""
            const commentValue = comment != null && comment.trim() !== '' ? comment.trim() : '';

            // Исключаем hotel_id из результата, так как он не сохраняется в резерве
            return {
                ...data,
                room_id,
                start,
                end,
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
        [user],
    );

    // Мемоизируем обработчики событий
    const onAcceptForm = useCallback(
        (formData: ReserveForm) => {
            if (!formData?.date?.[0] || !formData?.date?.[1]) {
                showToast('Ошибка при создании брони, проверьте даты', 'error');
                return;
            }

            const data = deserializeData(formData);
            onAccept(currentReserve ? { ...data, id: currentReserve?.reserve?.id } : data);
        },
        [currentReserve, deserializeData, onAccept],
    );

    const onError: SubmitErrorHandler<ReserveForm> = useCallback(() => {
        showToast(`Заполните все обязательные поля`, 'error');
    }, []);

    const onReserveDelete = useCallback(() => {
        if (!currentReserve?.reserve?.id || !onDelete) {
            showToast('Ошибка во время удаления брони, отсутсвует id', 'error');
            return;
        }

        onDelete(currentReserve.reserve.id);
    }, [currentReserve, onDelete]);
    return (
        <FormProvider {...form}>
            <div className={cx.container}>
                <FormTitle>Бронирование</FormTitle>

                <form>
                    <div className="space-y-1">
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
                                            if (range?.from) {
                                                field.onChange([
                                                    range.from,
                                                    range.to || range.from,
                                                ]);
                                            } else {
                                                field.onChange(undefined);
                                            }
                                        }}
                                        label="Период бронирования"
                                        numberOfMonths={2}
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
                                            Название отеля <span className="text-red-500">*</span>
                                        </Label>
                                        <Select
                                            value={field.value?.id}
                                            onValueChange={(value) => {
                                                const selectedHotel = hotelOptions.find(
                                                    (hotel) => hotel.id === value,
                                                );
                                                if (selectedHotel) {
                                                    field.onChange(selectedHotel);
                                                }
                                            }}
                                            disabled={loading || !!currentReserve?.hotel?.id}
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
                                            <p className="text-sm text-red-500">{error.message}</p>
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
                                            disabled={isHotelsLoading || isRoomsLoading}
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
                                            <p className="text-sm text-red-500">{error.message}</p>
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
                                            Стоимость номера <span className="text-red-500">*</span>
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
                                            <p className="text-sm text-red-500">{error.message}</p>
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
                                            <p className="text-sm text-red-500">{error.message}</p>
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
                                    <Label htmlFor="comment">Комментарии</Label>
                                    <Textarea
                                        {...field}
                                        id="comment"
                                        className={cx.fields}
                                        placeholder="Введите комментарий"
                                        rows={2}
                                    />
                                </div>
                            )}
                        />

                        <ReserveTotal
                            date={date}
                            price={price}
                            prepayment={prepayment}
                            className={cx.fields}
                            Prepayment={
                                <Controller
                                    name="prepayment"
                                    control={control}
                                    render={({ field }) => (
                                        <Input
                                            {...field}
                                            className={cx.fields}
                                            disabled={loading}
                                            value={String(field?.value || 0)}
                                            onChange={field.onChange}
                                            type={'number'}
                                        />
                                    )}
                                />
                            }
                        />

                        <FormButtons
                            className={cx.buttons}
                            onDelete={onReserveDelete}
                            deleteText={'Удалить бронь'}
                            isEdit={isEdit}
                            isLoading={loading}
                            onClose={onClose}
                            onAccept={handleSubmit(onAcceptForm, onError)}
                        />

                        <div className={cx.info}>
                            {formData?.created_at && !formData?.edited_at && (
                                <div className="flex gap-2 justify-end">
                                    <p className="text-sm text-gray-600">
                                        Создано {formData?.created_by}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                        {dayjs(formData?.created_at).format('DD.MM.YYYY')}
                                    </p>
                                </div>
                            )}
                            {formData?.edited_at && (
                                <div className="flex gap-2 justify-end">
                                    <p className="text-sm text-gray-600">
                                        Последнее изменение {formData?.edited_by}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                        {dayjs(formData?.edited_at).format('DD.MM.YYYY')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </FormProvider>
    );
};
