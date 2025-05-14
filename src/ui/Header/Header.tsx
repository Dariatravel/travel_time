'use client';

import React from 'react';
import { cnMixSpace } from '@consta/uikit/MixSpace';
import { User } from '@consta/uikit/User';
import logo from '../../../public/main/logo.svg';
import Image from 'next/image';
import cx from './styles.module.scss';
import { Layout } from '@consta/header/Layout';
import { useSignOut } from '@/shared/api/auth/auth';
import { useUnit } from 'effector-react/compat';
import { $user } from '@/shared/models/auth';
import { Dropdown, MenuProps } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { redirect } from 'next/navigation';
import { translateUserRole } from '@/shared/lib/translateUser';
import Link from 'next/link';
import { routes } from '@/shared/config/routes';

const RowCenterRight = () => {
    const user = useUnit($user);
    const { mutateAsync, isPending } = useSignOut();
    const items: MenuProps['items'] = [
        // {
        //   key: "1",
        //   label: "Профиль",
        //   extra: "⌘B",
        // },
        {
            key: '2',
            label: 'Выйти',
            icon: <LogoutOutlined />,
            onClick: async () => {
                console.log('asdasd');
                await mutateAsync();
                // await setUser(null);
                redirect('/login');
            },
        },
    ];

    if (!user) return null;

    return (
        <div>
            {/*<Notifications items={notifications}/>*/}
            {/*<TileMenu items={tiles}/>*/}
            <Dropdown menu={{ items }} trigger={['click']}>
                <User
                    className={cnMixSpace({ mL: 'xs' })}
                    avatarUrl="https://avatars.githubusercontent.com/u/13190808?v=4"
                    name={`${user?.name} ${user?.surname}`}
                    info={translateUserRole(user?.user_metadata?.role)}
                    withArrow={true}
                />
            </Dropdown>
        </div>
    );
};
export const LayoutExampleBig = () => {
    // const { data } = useUser();

    return (
        <Layout
            className={cx.header}
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            rowTop={{
                left: (
                    <Link href={routes.MAIN} className={cx.logoContainer}>
                        <Image src={logo.src} alt={'Лого'} layout={'fill'} objectFit={'cover'} />
                    </Link>
                ),
                right: <RowCenterRight />,
            }}
            placeholder={undefined}
            onPointerEnterCapture={undefined}
            onPointerLeaveCapture={undefined}
        />
    );
};
