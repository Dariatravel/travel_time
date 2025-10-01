import { FormButtons } from '@/components/ui/form-buttons';
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
import { FormMultipleSelector } from '@/features/HotelModal/ui/components/FormMultipleSelector';
import { RoomForm, useGetHotelsForRoom } from '@/shared/api/hotel/hotel';
import { CurrentReserveType, Nullable } from '@/shared/api/reserve/reserve';
import { Room, RoomDTO } from '@/shared/api/room/room';
import { adaptToOption } from '@/shared/lib/adaptHotel';
import { devLog } from '@/shared/lib/logger';
import { showToast } from '@/shared/ui/Toast/Toast';
import { zodResolver } from '@hookform/resolvers/zod';
import cn from 'classnames';
import { FC, useMemo } from 'react';
import { Controller, Form, SubmitErrorHandler, useForm } from 'react-hook-form';
import { z } from 'zod';
import cx from './style.module.css';
export interface RoomInfoProps {
    onClose: () => void;
    onAccept: (args?: unknown) => void;
    onDelete: (id: string) => void;
    currentReserve?: Nullable<CurrentReserveType>;
    isLoading?: boolean;
    isEdit?: boolean;
}

/**
 * RoomFormSchema — схема валидации для формы создания/редактирования номера.
 */
export const RoomFormSchema = z.object({
    hotel_id: z.object({
        id: z.string().min(1, 'Отель обязателен для выбора'),
        title: z.string().min(1, 'Название отеля обязательно'),
    }),
    title: z.string().min(1, 'Название номера обязательно'),
    price: z
        .string()
        .min(1, 'Стоимость обязательна для заполнения')
        .refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
            message: 'Стоимость должна быть положительным числом',
        }),
    quantity: z.union([z.string(), z.number()]).refine(
        (val) => {
            const num = typeof val === 'string' ? Number(val) : val;
            return !isNaN(num) && num > 0;
        },
        { message: 'Вместимость должна быть положительным числом' },
    ),
    room_features: z.array(z.string()),
    comment: z.string().optional(),
});

export type RoomFormSchemaType = z.infer<typeof RoomFormSchema>;

/**
 * Опции особенностей номера для Combobox
 */
const ROOM_FEATURES_OPTIONS = [
    { value: 'wifi', label: 'Wi-Fi' },
    { value: 'air_conditioning', label: 'Кондиционер' },
    { value: 'minibar', label: 'Мини-бар' },
    { value: 'tv', label: 'Телевизор' },
    { value: 'balcony', label: 'Балкон' },
    { value: 'sea_view', label: 'Вид на море' },
    { value: 'jacuzzi', label: 'Джакузи' },
    { value: 'kitchenette', label: 'Кухонный уголок' },
    { value: 'safe', label: 'Сейф' },
    { value: 'refrigerator', label: 'Холодильник' },
    { value: 'washing_machine', label: 'Стиральная машина' },
    { value: 'iron', label: 'Утюг' },
    { value: 'hair_dryer', label: 'Фен' },
    { value: 'towels', label: 'Полотенца' },
    { value: 'linen', label: 'Постельное белье' },
];

export const RoomInfo: FC<RoomInfoProps> = ({
    onAccept,
    onClose,
    currentReserve,
    isLoading = false,
    isEdit = false,
    onDelete,
}: RoomInfoProps) => {
    const { data: hotels, isLoading: isHotelsLoading } = useGetHotelsForRoom();

    const loading = isLoading || isHotelsLoading;

    const form = useForm<RoomFormSchemaType>({
        resolver: zodResolver(RoomFormSchema),
        defaultValues: {
            hotel_id: currentReserve?.hotel
                ? adaptToOption({
                      id: currentReserve?.hotel?.id,
                      title: currentReserve?.hotel?.title,
                  })
                : { id: '', title: '' },
            title: currentReserve?.room?.title || '',
            comment: currentReserve?.room?.comment || '',
            quantity: currentReserve?.room?.quantity ?? 3,
            price: String(currentReserve?.room?.price ?? ''),
            room_features: currentReserve?.room?.room_features ?? [],
        },
        mode: 'all',
        reValidateMode: 'onBlur',
    });

    const { control, watch } = form;
    const hotelOptions = useMemo(() => {
        const hotelsTmp = hotels?.map(adaptToOption);
        return hotelsTmp ?? [];
    }, [hotels]);
    const formData = watch();

    const deserializeData = (data: RoomFormSchemaType): Room | RoomDTO => {
        return {
            title: data.title,
            price: Number(data?.price ? data?.price : '0'),
            quantity: typeof data.quantity === 'string' ? Number(data.quantity) : data.quantity,
            comment: data.comment,
            room_features: data.room_features || [],
            hotel_id: data.hotel_id?.id || '',
            image_path: '',
            image_title: '',
            ...(currentReserve?.room?.id && { id: currentReserve.room.id }),
        };
    };

    const onAcceptForm = async () => {
        const data = deserializeData(formData);

        devLog('onAcceptForm', data);
        onAccept(data);
    };

    const onError: SubmitErrorHandler<RoomForm> = () => {
        showToast(`Заполните все обязательные поля`, 'error');
        return;
    };

    return (
        <div className={cx.container}>
            <FormTitle>{isEdit ? 'Редактирование номера' : 'Добавление номера'}</FormTitle>
            <Form {...form}>
                <form
                    onSubmit={(event) => {
                        console.log('хэлоу');
                        event.preventDefault();
                        event.stopPropagation();
                        form.handleSubmit(onAcceptForm, onError)(event);
                    }}
                >
                    <div className="space-y-4">
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
                            name="title"
                            control={control}
                            rules={{ required: 'Название номера обязательно для заполнения' }}
                            render={({ field, fieldState: { error } }) => (
                                <div className="space-y-2">
                                    <Label htmlFor="title">
                                        Название номера <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        {...field}
                                        id="title"
                                        placeholder="Введите название"
                                        className={cx.fields}
                                        disabled={loading}
                                    />
                                    {error?.message && (
                                        <p className="text-sm text-red-500">{error.message}</p>
                                    )}
                                </div>
                            )}
                        />

                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2">
                                <Controller
                                    name="price"
                                    control={control}
                                    rules={{
                                        required: 'Стоимость номера обязательна для заполнения',
                                    }}
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
                                                disabled={loading}
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
                            <div>
                                <Controller
                                    name="quantity"
                                    control={control}
                                    rules={{ required: 'Вместимость обязательна для заполнения' }}
                                    render={({ field, fieldState: { error } }) => (
                                        <div className="space-y-2">
                                            <Label htmlFor="quantity">
                                                Вместимость <span className="text-red-500">*</span>
                                            </Label>
                                            <Input
                                                {...field}
                                                id="quantity"
                                                type="number"
                                                placeholder="Введите число"
                                                value={String(field?.value)}
                                                className={cx.fields}
                                                disabled={loading}
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
                        </div>
                        <Controller
                            name="comment"
                            control={control}
                            rules={{ required: true }}
                            render={({ field }) => (
                                <div className="space-y-2">
                                    <Label htmlFor="comment">Комментарии</Label>
                                    <Textarea
                                        {...field}
                                        id="comment"
                                        placeholder="Введите комментарий"
                                        className={cn(cx.fields, cx.description)}
                                        disabled={loading}
                                        rows={3}
                                    />
                                </div>
                            )}
                        />

                        <Controller
                            name="room_features"
                            control={control}
                            render={({ field, fieldState: { error } }) => (
                                <FormMultipleSelector
                                    label="Особенности номера"
                                    placeholder="Выберите особенности номера"
                                    options={ROOM_FEATURES_OPTIONS}
                                    value={
                                        field.value?.map((feature) => ({
                                            value: feature,
                                            label:
                                                ROOM_FEATURES_OPTIONS.find(
                                                    (opt) => opt.value === feature,
                                                )?.label || feature,
                                        })) || []
                                    }
                                    onChange={(options) => {
                                        field.onChange(options.map((option) => option.value));
                                    }}
                                    disabled={loading}
                                    error={error?.message}
                                    className={cx.fields}
                                />
                            )}
                        />

                        <FormButtons
                            className={cx.buttons}
                            isLoading={loading}
                            onAccept={onAcceptForm}
                            onClose={onClose}
                            isEdit={isEdit}
                            onDelete={() =>
                                currentReserve?.room?.id && onDelete(currentReserve?.room?.id)
                            }
                            deleteText={'Удалить номер'}
                        />
                    </div>
                </form>
            </Form>
        </div>
    );
};
