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
import { FC, useEffect, useMemo } from 'react';
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
    hotel_id: z.object(
        {
            id: z.string({ message: 'Отель обязателен' }).min(1, 'Отель обязателен'),
            label: z.string(),
        },
        { message: 'Отель обязателен' },
    ),
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
        .regex(/^\+7 \d{3} \d{3}-\d{2}-\d{2}$/, 'Введите корректный номер телефона'),
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
}: ReserveInfoProps) => {
    const {
        data: hotels,
        isLoading: isHotelsLoading,
        status: hotelsStatus,
    } = useGetHotelsForRoom();

    const user = useUnit($user);

    const getDefaultValues = ({
        reserve,
        room,
        hotel,
    }: CurrentReserveType): Partial<ReserveForm> => {
        const getReserveDefaults = ({
            start,
            end,
            price,
            prepayment,
            guest,
            phone,
            comment,
            quantity,
        }: Partial<ReserveDTO>) => {
            const currentDate: [Date, Date] =
                start && end ? [new Date(start), new Date(end)] : [new Date(), new Date()];
            return {
                date: currentDate,
                price,
                prepayment: prepayment ? String(prepayment) : String(0),
                guest,
                phone,
                comment,
                quantity: quantity ?? 2,
            };
        };

        let defaults = {
            date: [moment().toDate(), moment().add(2, 'days').toDate()] as [Date, Date],
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
            price: room?.price,
            quantity: 2,
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
                quantity: reserveDefaults.quantity ?? defaults.quantity,
            };
        }

        return defaults;
    };

    const form = useForm<ReserveForm>({
        resolver: zodResolver(reserveFormSchema),
        mode: 'onChange',
        defaultValues: currentReserve?.hotel ? getDefaultValues(currentReserve) : undefined,
    });

    const {
        control,
        watch,
        setValue,
        formState: { errors },
        handleSubmit,
    } = form;

    const formData = watch();

    const {
        data: rooms,
        isLoading: isRoomsLoading,
        refetch: fetchRoomsByHotel,
    } = useGetRoomsByHotel(formData?.hotel_id?.id, false);

    const hotelOptions = useMemo(() => {
        const hotelsTmp = hotels?.map(adaptToOption);

        return hotelsTmp ?? [];
    }, [hotels]);

    const roomOptions = useMemo(() => {
        const hotelsTmp = rooms?.map(adaptToOption);

        return hotelsTmp ?? [];
    }, [rooms]);

    useEffect(() => {
        if (hotelsStatus === 'success' && !!formData.hotel_id) {
            fetchRoomsByHotel();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hotelsStatus, formData.hotel_id]);

    useEffect(() => {
        // если комнат нет - выходим
        if (rooms?.length === 0 || !!currentReserve?.reserve?.price) return;

        const room = rooms?.find((room) => room.id === formData?.room_id?.id);

        if (room) {
            setValue('price', room?.price);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.room_id]);

    const loading = isLoading || isHotelsLoading;

    const deserializeData = ({
        date,
        price,
        quantity,
        prepayment = 0,
        hotel_id: _,
        ...data
    }: ReserveForm) => {
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

        return {
            ...data,
            room_id,
            start,
            end,
            price: priceNumber,
            quantity: quantityNumber,
            prepayment: prepaymentNumber,
            created_by,
            edited_by,
            created_at,
            edited_at,
        };
    };

    const onAcceptForm = (formData: ReserveForm) => {
        if (!formData?.date?.[0] || !formData?.date?.[1]) {
            showToast('Ошибка при создании брони, проверьте даты', 'error');
            return;
        }

        const data = deserializeData(formData);
        onAccept(currentReserve ? { ...data, id: currentReserve?.reserve?.id } : data);
    };

    const onError: SubmitErrorHandler<ReserveForm> = () => {
        showToast(`Заполните все обязательные поля`, 'error');
    };

    const onReserveDelete = () => {
        if (!currentReserve?.reserve?.id || !onDelete) {
            showToast('Ошибка во время удаления брони, отсутсвует id', 'error');
            return;
        }

        onDelete(currentReserve?.reserve?.id);
    };
    return (
        <FormProvider {...form}>
            <div className={cx.container}>
                <FormTitle>Бронирование</FormTitle>

                <form onSubmit={handleSubmit(onAcceptForm, onError)}>
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
                                            Количество человек{' '}
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
                            date={formData?.date}
                            price={formData.price}
                            prepayment={formData.prepayment}
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
                                            value={String(field?.value)}
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
                            onAccept={() => {}}
                            onClose={onClose}
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
