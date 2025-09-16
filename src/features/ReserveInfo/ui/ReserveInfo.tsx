import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { FormButtons } from '@/components/ui/form-buttons';
import { FormTitle } from '@/components/ui/form-title';
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
import { Textarea } from '@/components/ui/textarea';
import { ReserveTotal } from '@/features/ReserveInfo/ui/ReserveTotal';
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
import { PhoneInput } from '@/shared/ui/PhoneInput/PhoneInput';
import { showToast } from '@/shared/ui/Toast/Toast';
import cn from 'classnames';
import dayjs from 'dayjs';
import { useUnit } from 'effector-react/compat';
import { CalendarIcon } from 'lucide-react';
import moment from 'moment';
import { FC, useEffect, useMemo } from 'react';
import { Controller, SubmitErrorHandler, useForm } from 'react-hook-form';
import cx from './style.module.scss';

export interface ReserveInfoProps {
    onClose: () => void;
    onAccept: (reserve: Reserve | ReserveDTO) => void;
    currentReserve?: Nullable<CurrentReserveType>;
    isLoading: boolean;
    isEdit?: boolean;
    onDelete?: (id: string) => void;
}

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
                quantity,
            };
        };

        let defaults = {
            date: [moment().toDate(), moment().add(1, 'days').toDate()] as [Date, Date],
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
            created_by: currentReserve?.reserve?.created_by,
            edited_by: currentReserve?.reserve?.edited_by,
            created_at: currentReserve?.reserve?.created_at,
            edited_at: currentReserve?.reserve?.edited_at,
        };

        if (!!reserve) {
            defaults = { ...defaults, ...getReserveDefaults(reserve) };
        }

        return defaults;
    };

    const {
        control,
        register,
        watch,
        setValue,
        formState: { errors },
        handleSubmit,
    } = useForm<ReserveForm>({
        mode: 'onSubmit',
        defaultValues: currentReserve?.hotel ? getDefaultValues(currentReserve) : undefined,
    });

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
    }, [hotelsStatus, formData.hotel_id]);

    useEffect(() => {
        // если комнат нет - выходим
        if (rooms?.length === 0 || !!currentReserve?.reserve?.price) return;

        const room = rooms?.find((room) => room.id === formData?.room_id?.id);

        if (room) {
            setValue('price', room?.price);
        }
    }, [formData.room_id]);

    const loading = isLoading || isHotelsLoading;

    const deserializeData = ({
        hotel_id,
        date,
        price,
        quantity,
        prepayment = 0,
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

    const onError: SubmitErrorHandler<ReserveForm> = (errors) => {
        showToast(`Заполните все обязательные поля`, 'error');
        return;
    };

    const onReserveDelete = () => {
        if (!currentReserve?.reserve?.id || !onDelete) {
            showToast('Ошибка во время удаления брони, отсутсвует id', 'error');
            return;
        }

        onDelete(currentReserve?.reserve?.id);
    };
    return (
        <div className={cx.container}>
            <FormTitle>Бронирование</FormTitle>

            <div className="space-y-4">
                <Controller
                    name="date"
                    control={control}
                    rules={{ required: 'Период обязателен для заполнения' }}
                    render={({ field, fieldState: { error } }) => (
                        <div className="space-y-2">
                            <Label>
                                Период бронирования <span className="text-red-500">*</span>
                            </Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            'w-full justify-start text-left font-normal',
                                            !field.value && 'text-muted-foreground',
                                            cx.fields,
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {field.value
                                            ? field.value[0] && field.value[1]
                                                ? `${dayjs(field.value[0]).format('DD.MM.YYYY')} - ${dayjs(field.value[1]).format('DD.MM.YYYY')}`
                                                : 'Выберите даты'
                                            : 'Выберите даты'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="range"
                                        selected={field.value}
                                        onSelect={field.onChange}
                                        numberOfMonths={2}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            {error?.message && (
                                <p className="text-sm text-red-500">{error.message}</p>
                            )}
                        </div>
                    )}
                />
                <div className="grid grid-cols-2 gap-4">
                    <Controller
                        name="hotel_id"
                        control={control}
                        rules={{ required: 'Отель обязателен для заполнения' }}
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
                        rules={{ required: 'Номер обязателен для заполнения' }}
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
                        rules={{ required: 'Стоимость обязательна для заполнения' }}
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
                        rules={{ required: 'Кол-во гостей обязательно для заполнения' }}
                        render={({ field, fieldState: { error } }) => (
                            <div className="space-y-2">
                                <Label htmlFor="quantity">
                                    Количество человек <span className="text-red-500">*</span>
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
                    rules={{ required: 'Гость обязателен для заполнения' }}
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
                            {error?.message && (
                                <p className="text-sm text-red-500">{error.message}</p>
                            )}
                        </div>
                    )}
                />

                <Controller
                    name="phone"
                    rules={{ required: true }}
                    control={control}
                    render={({ field }) => (
                        <PhoneInput
                            {...field}
                            control={control}
                            name="phone"
                            placeholder="+7 (...)"
                            required
                            label="Номер гостя"
                            className={cx.fields}
                            error={errors.phone?.message}
                            showWhatsapp
                        />
                    )}
                />

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
                    deleteText={''}
                    isEdit={isEdit}
                    isLoading={loading}
                    onAccept={handleSubmit(onAcceptForm, onError)}
                    onClose={onClose}
                />

                <div className={cx.info}>
                    {formData?.created_at && !formData?.edited_at && (
                        <div className="flex gap-2 justify-end">
                            <p className="text-sm text-gray-600">Создано {formData?.created_by}</p>
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
        </div>
    );
};
