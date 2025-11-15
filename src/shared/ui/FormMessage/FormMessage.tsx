import cx from 'classnames';
import { FC } from 'react';
import styles from './style.module.scss';

/**
 * Интерфейс для компонента FormMessage
 */
export interface FormMessageProps {
    /** Текст сообщения об ошибке */
    message?: string;
    /** Дополнительные CSS классы */
    className?: string;
}

/**
 * Компонент для отображения сообщений об ошибках в форме
 * Отображается только если есть сообщение
 */
export const FormMessage: FC<FormMessageProps> = ({ message, className }) => {
    if (!message) return null;

    return <span className={cx(styles.formMessage, className)}>{message}</span>;
};
