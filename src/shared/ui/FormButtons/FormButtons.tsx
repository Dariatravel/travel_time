import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PopoverClose } from '@radix-ui/react-popover';
import cn from 'classnames';
import { TrashIcon } from 'lucide-react';
import { FC } from 'react';
import styles from './style.module.scss';

export interface FormButtonsProps {
    onClose: () => void;
    onAccept?: () => void; // Опциональный, для случаев когда форма сама обрабатывает submit
    isLoading?: boolean;
    isEdit?: boolean;
    deleteText?: string;
    onDelete?: () => void;
    className?: string;
}

export const FormButtons: FC<FormButtonsProps> = ({
    onClose,
    isLoading = false,
    isEdit = false,
    deleteText,
    onDelete,
    onAccept,
    className,
}: FormButtonsProps) => {
    return (
        <div className={cn(className, styles.container)}>
            {isEdit && onDelete && (
                <div className={cn(styles.deleteContainer, 'flex justify-end mb-2')}>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline"> {deleteText}</Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 py-4 px-1">
                            <div className="flex flex-col gap-4 items-center">
                                <div className="font-medium text-red-500">Потвердите удаление</div>
                                <div className="flex gap-2">
                                    <Button
                                        aria-label={'Удалить бронь'}
                                        variant="outline"
                                        className="text-red-500"
                                        onClick={onDelete}
                                    >
                                        {deleteText}
                                        <TrashIcon />
                                    </Button>
                                    <PopoverClose>
                                        <Button variant="outline">Отмена</Button>
                                    </PopoverClose>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            )}
            <div className="grid grid-cols-2  gap-2">
                <Button
                    variant="outline"
                    className=" text-red-500"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onClose();
                    }}
                    disabled={isLoading}
                >
                    Отмена
                </Button>
                <Button onClick={onAccept} disabled={isLoading}>
                    {isEdit ? 'Сохранить' : 'Добавить'}
                </Button>
            </div>
        </div>
    );
};
