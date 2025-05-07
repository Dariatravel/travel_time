import React, { ComponentProps, CSSProperties, FC, useEffect } from 'react';
import { Modal as ModalConsta } from '@consta/uikit/Modal';
import st from './style.module.scss';
import { FullWidthLoader } from '@/shared/ui/Loader/Loader';
import cn from 'classnames';

export interface ModalProps extends ComponentProps<typeof ModalConsta> {
    style?: CSSProperties;
    loading?: boolean;
}

export const Modal: FC<ModalProps> = ({ children, loading = false, ...props }) => {
    const { isOpen } = props;

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    return (
        <ModalConsta
            {...props}
            rootClassName={cn(st.sidebarOverlay, { [st.rootLoading]: loading })}
            className={cn(st.modal, {
                [st.modalLoading]: loading,
                [st.opened]: isOpen,
            })}
        >
            <div className={st.close} onClick={props.onClose}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M12 13.4142L19.7782 21.1924L21.1924 19.7782L13.4142 12L21.1924 4.22183L19.7782 2.80762L12 10.5858L4.22183 2.80762L2.80762 4.22183L10.5858 12L2.80762 19.7782L4.22183 21.1924L12 13.4142Z"
                        fill="black"
                    />
                </svg>
            </div>
            {loading && (
                // <div className={st.loading}>
                <FullWidthLoader className={st.loader} />
                // </div>
            )}
            {children}
        </ModalConsta>
    );
};
