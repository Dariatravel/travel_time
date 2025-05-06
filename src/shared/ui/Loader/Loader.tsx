import React, { ComponentProps, CSSProperties, FC, useCallback, useEffect, useState } from 'react';
import { Loader as LoaderConsta } from '@consta/uikit/Loader';
import cx from './style.module.scss';
import cn from 'classnames';

export interface LoaderProps extends ComponentProps<typeof LoaderConsta> {
    style?: CSSProperties;
    className?: string;
}

export const Loader: FC<LoaderProps> = ({ style, ...props }) => {
    return <LoaderConsta className={cx.loader} type={'dots'} size={'m'} {...props} />;
};

export const FullWidthLoader: FC<LoaderProps> = ({ style, className, ...props }) => {
    return (
        <div className={cn(cx.container, className)}>
            <Loader />
        </div>
    );
};
