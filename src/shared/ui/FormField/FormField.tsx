import cx from 'classnames';
import { FC, ReactNode } from 'react';
import styles from './style.module.scss';

/**
 * Интерфейс для компонента FormField
 */
export interface FormFieldProps {
    /** Дочерние элементы для отображения внутри поля формы */
    children: ReactNode;
    /** Дополнительные CSS классы */
    className?: string;
}

/**
 * Компонент обёртка для поля формы
 * Используется для стандартизации отображения полей формы
 */
export const FormField: FC<FormFieldProps> = ({ children, className }) => {
    return <div className={cx(styles.formField, className)}>{children}</div>;
};
