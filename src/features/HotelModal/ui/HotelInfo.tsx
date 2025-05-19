import { HOTEL_TYPES } from '@/features/HotelModal/lib/const';
import { TravelUser } from '@/shared/api/auth/auth';
import { CreateHotelDTO, Hotel, HotelDTO } from '@/shared/api/hotel/hotel';
import { uploadHotelImage } from '@/shared/api/hotel/hotelImage';
import { CurrentReserveType, Nullable } from '@/shared/api/reserve/reserve';
import { adaptToOption } from '@/shared/lib/adaptHotel';
import { FORM_SIZE } from '@/shared/lib/const';
import { translateUserRole } from '@/shared/lib/translateUser';
import { FormButtons } from '@/shared/ui/FormButtons/FormButtons';
import { FormTitle } from '@/shared/ui/FormTitle/FormTitle';
import { LinkIcon } from '@/shared/ui/LinkIcon/LinkIcon';
import { PhoneInput } from '@/shared/ui/PhoneInput/PhoneInput';
import { GridItem } from '@consta/uikit/Grid';
import { Select } from '@consta/uikit/Select';
import { TextField } from '@consta/uikit/TextField';
import { Flex } from 'antd';
import { FC, useCallback, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FaTelegram } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { HotelFormSchema } from '../lib/validation';
import { HotelImageUpload } from './HotelImageUpload/HotelImageUpload';
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
        user_id: hotel?.user_id ? adaptToOption({ title: hotel?.user_id, id: hotel?.user_id }) : undefined,
        type: hotel?.type ? adaptToOption({ title: hotel?.type, id: hotel?.type }) : undefined,
        description: hotel?.description || '',
        image_id: hotel?.image_id ? { id: hotel.image_id, file: new File([], '') } : null,
    };
};

const deserializeData = (data: HotelFormSchema): Hotel | CreateHotelDTO => {
    const hotelData = {
        ...data,
        type: data.type.label,
        rating: +data.rating,
        user_id: data.user_id.id,
        description: data.description || '',
        image_id: data.image_id?.id,
    };

    if (data.id) {
        return {
            ...hotelData,
            id: data.id,
        } as Hotel;
    }

    return hotelData as CreateHotelDTO;
};

export const HotelInfo: FC<HotelInfoProps> = ({ users, onAccept, onDelete, onClose, currentReserve, isLoading = false, isEdit = false }: HotelInfoProps) => {
    const {
        control,
        getValues,
        register,
        handleSubmit,
        watch,
        setValue,
        formState: { errors },
    } = useForm<HotelFormSchema>({
        defaultValues: getInitialValue(currentReserve?.hotel),
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
        const formData = getValues();
        const imageFile = formData.image_id?.file;

        let imagePath: string | undefined;
        if (imageFile) {
            try {
                imagePath = await uploadHotelImage(imageFile);
            } catch (error) {
                toast.error('Ошибка при загрузке изображения');
                return;
            }
        }

        const serializedData = deserializeData({
            ...formData,
            image_id: imagePath ? { id: imagePath, file: imageFile! } : null,
        });

        await onAccept(serializedData);
    }, [getValues, onAccept]);

    return (
        <Flex vertical>
            <FormTitle>{isEdit ? 'Редактирование отеля' : 'Добавление отеля'}</FormTitle>
            <Controller
                name="title"
                control={control}
                rules={{ required: 'Название отеля обязательно для заполнения' }}
                render={({ field }) => (
                    <TextField
                        {...field}
                        placeholder="Введите название"
                        label="Название отеля"
                        required
                        size={FORM_SIZE}
                        disabled={isLoading}
                        className={cx.fields}
                        status={errors.title ? 'alert' : undefined}
                        caption={errors.title?.message}
                    />
                )}
            />

            <Controller
                name="type"
                control={control}
                render={({ field }) => (
                    <Select
                        {...field}
                        items={HOTEL_TYPES}
                        placeholder={'Выберите из списка'}
                        label={'Тип'}
                        required
                        size={FORM_SIZE}
                        dropdownClassName={cx.dropdown}
                        disabled={isLoading}
                        className={cx.fields}
                        status={errors.type ? 'alert' : undefined}
                        caption={errors.type?.message}
                    />
                )}
            />
            <Controller
                name="address"
                control={control}
                rules={{ required: 'Адрес обязателен для заполнения' }}
                render={({ field }) => (
                    <TextField
                        {...field}
                        placeholder="Введите адрес"
                        label="Местоположение"
                        required
                        size={FORM_SIZE}
                        disabled={isLoading}
                        className={cx.fields}
                        status={errors.address ? 'alert' : undefined}
                        caption={errors.address?.message}
                    />
                )}
            />

            <Controller
                name="telegram_url"
                control={control}
                render={({ field }) => (
                    <TextField
                        {...field}
                        placeholder="Вставьте ссылку"
                        label="Ссылка на отель в Telegram"
                        size={FORM_SIZE}
                        disabled={isLoading}
                        className={cx.fields}
                        status={errors.telegram_url ? 'alert' : undefined}
                        caption={errors.telegram_url?.message}
                        rightSide={() => (formData?.telegram_url ? <LinkIcon icon={<FaTelegram color="2AABEE" size={'24px'} />} link={formData?.telegram_url} /> : null)}
                    />
                )}
            />
            <PhoneInput
                control={control}
                name="phone"
                placeholder="+7 (...)"
                required
                label="Номер телефона"
                size={FORM_SIZE}
                disabled={isLoading}
                className={cx.fields}
                error={errors.phone?.message}
            />
            <GridItem col={4}>
                <Controller
                    name="user_id"
                    control={control}
                    render={({ field }) => (
                        <Select
                            {...field}
                            items={userOptions}
                            placeholder={'Выберите отельера'}
                            label={'Отельер'}
                            required
                            size={FORM_SIZE}
                            dropdownClassName={cx.dropdown}
                            disabled={isLoading}
                            className={cx.fields}
                            status={errors.user_id ? 'alert' : undefined}
                            caption={errors.user_id?.message}
                        />
                    )}
                />
            </GridItem>
            <Controller
                name="image_id"
                control={control}
                render={({ field }) => <HotelImageUpload value={field.value} onChange={field.onChange} disabled={isLoading} error={errors.image_id?.message} />}
            />
            <Controller
                name="description"
                control={control}
                render={({ field }) => (
                    <TextField
                        {...field}
                        label="Комментарии"
                        type="textarea"
                        cols={200}
                        rows={3}
                        placeholder="Введите комментарий"
                        size={FORM_SIZE}
                        disabled={isLoading}
                        className={cx.fields}
                        status={errors.description ? 'alert' : undefined}
                        caption={errors.description?.message}
                    />
                )}
            />
            <FormButtons
                onDelete={() => currentReserve?.hotel && onDelete(currentReserve?.hotel.id)}
                deleteText={'Удалить отель'}
                isEdit={isEdit}
                isLoading={isLoading}
                onAccept={handleSubmit(onAcceptForm)}
                onClose={onClose}
            />
        </Flex>
    );
};
