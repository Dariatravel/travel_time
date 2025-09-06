import { Button } from '@/components/ui/button';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { Flex, Popconfirm } from 'antd';
import cn from 'classnames';
import { FC } from 'react';
import { FaRegTrashAlt } from 'react-icons/fa';
import styles from './style.module.scss';

export interface FormButtonsProps {
    onClose: () => void;
    onAccept: () => void;
    isLoading?: boolean;
    isEdit?: boolean;
    deleteText?: string;
    onDelete?: () => void;
    className?: string;
}

export const FormButtons: FC<FormButtonsProps> = ({
    onAccept,
    onClose,
    isLoading = false,
    isEdit = false,
    deleteText,
    onDelete,
    className,
}: FormButtonsProps) => {
    return (
        <div className={cn(className, styles.container)}>
            {isEdit && onDelete && (
                <div className={styles.deleteContainer}>
                    <Flex justify="end">
                        <Popconfirm
                            title={deleteText}
                            description={'Вы уверены?'}
                            icon={<QuestionCircleOutlined style={{ color: 'red' }} />}
                            onConfirm={onDelete}
                            okText={'Удалить'}
                            okButtonProps={{ style: { background: 'red' } }}
                            cancelText={'Отмена'}
                            onCancel={(e) => {
                                e?.preventDefault();
                                e?.stopPropagation();
                            }}
                        >
                            <Button
                                aria-label={'Удалить бронь'}
                                variant="outline"
                                className="text-red-500"
                            >
                                {deleteText}
                                <FaRegTrashAlt />
                            </Button>
                        </Popconfirm>
                    </Flex>
                </div>
            )}
            <div className="grid grid-cols-2  gap-2">
                <Button
                    variant="outline"
                    className=" text-red-500"
                    onClick={onClose}
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
