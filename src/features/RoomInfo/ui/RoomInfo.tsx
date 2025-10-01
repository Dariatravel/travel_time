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
import { INITIAL_ROOM_FEATURES } from '@/features/AdvancedFilters';
import { FormMultipleSelector } from '@/features/HotelModal/ui/components/FormMultipleSelector';
import { useGetHotelsForRoom } from '@/shared/api/hotel/hotel';
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
    hotel_id: z.string().min(1, 'Отель обязателен для выбора'),

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
            hotel_id: currentReserve?.hotel?.id ? currentReserve?.hotel?.id : '',
            title: currentReserve?.room?.title || '',
            comment: currentReserve?.room?.comment || '',
            quantity: currentReserve?.room?.quantity ?? 3,
            price: String(currentReserve?.room?.price ?? ''),
            room_features: currentReserve?.room?.room_features ?? [],
        },
        mode: 'onBlur',
        reValidateMode: 'onBlur',
    });

    const { control, handleSubmit, formState } = form;
    const { errors, isValid, isDirty } = formState;

    console.log('Состояние формы:', { errors, isValid, isDirty });
    const hotelOptions = useMemo(() => {
        const hotelsTmp = hotels?.map(adaptToOption);
        return hotelsTmp ?? [];
    }, [hotels]);

    const deserializeData = (data: RoomFormSchemaType): Room | RoomDTO => {
        return {
            title: data.title,
            price: Number(data?.price ? data?.price : '0'),
            quantity: typeof data.quantity === 'string' ? Number(data.quantity) : data.quantity,
            comment: data.comment,
            room_features: data.room_features || [],
            hotel_id: data.hotel_id || '',
            image_path: '',
            image_title: '',
            ...(currentReserve?.room?.id && { id: currentReserve.room.id }),
        };
    };

    const onAcceptForm = async (data: RoomFormSchemaType) => {
        console.log('Данные формы перед отправкой:', data);
        const serializedData = deserializeData(data);

        devLog('onAcceptForm', serializedData);
        onAccept(serializedData);
    };

    const onError: SubmitErrorHandler<RoomFormSchemaType> = (errors) => {
        console.log('Ошибки валидации:', errors);
        console.log('Значения формы:', form.watch());

        // Маппинг полей на понятные названия
        const fieldNames: Record<string, string> = {
            hotel_id: 'Отель',
            title: 'Название номера',
            price: 'Стоимость',
            quantity: 'Вместимость',
            room_features: 'Особенности номера',
            comment: 'Комментарий',
        };

        // Получаем список полей с ошибками
        const errorFields = Object.keys(errors);
        const errorMessages = errorFields.map((field) => {
            const error = errors[field as keyof typeof errors];
            const fieldName = fieldNames[field] || field;
            return error?.message || `${fieldName} содержит ошибку`;
        });

        const errorText =
            errorMessages.length > 0
                ? `Ошибки в полях: ${errorMessages.join(', ')}`
                : 'Заполните все обязательные поля';

        showToast(errorText, 'error');
        return;
    };

    return (
        <div className={cx.container}>
            <FormTitle>{isEdit ? 'Редактирование номера' : 'Добавление номера'}</FormTitle>
            <Form {...form}>
                <form onSubmit={handleSubmit(onAcceptForm, onError)}>
                    <div className="space-y-4">
                        <Controller
                            name="hotel_id"
                            control={control}
                            render={({ field, fieldState: { error } }) => (
                                <div className="space-y-2">
                                    <Label htmlFor="hotel_id">
                                        Название отеля <span className="text-red-500">*</span>
                                    </Label>
                                    <Select
                                        value={field.value}
                                        onValueChange={(value) => {
                                            const selectedHotel = hotelOptions.find(
                                                (hotel) => hotel.id === value,
                                            );
                                            if (selectedHotel) {
                                                field.onChange(selectedHotel.id);
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
                        />{' '}
                        <Controller
                            name="room_features"
                            control={control}
                            render={({ field, fieldState: { error } }) => (
                                <FormMultipleSelector
                                    label="Особенности номера"
                                    placeholder="Выберите особенности номера"
                                    options={INITIAL_ROOM_FEATURES.map((feature) => ({
                                        value: feature.value,
                                        label: feature.label,
                                        disable: !feature.isActive,
                                    }))}
                                    value={
                                        field.value?.map((feature) => ({
                                            value: feature,
                                            label:
                                                INITIAL_ROOM_FEATURES.find(
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
                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2">
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
                        </div>{' '}
                        <Controller
                            name="comment"
                            control={control}
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
                        <FormButtons
                            className={cx.buttons}
                            isLoading={loading}
                            onAccept={handleSubmit(onAcceptForm, onError)}
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
