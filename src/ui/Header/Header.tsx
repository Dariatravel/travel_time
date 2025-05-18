'use client';

import { useSignOut } from '@/shared/api/auth/auth';
import { routes } from '@/shared/config/routes';
import { translateUserRole } from '@/shared/lib/translateUser';
import { $user } from '@/shared/models/auth';
import { LogoutOutlined } from '@ant-design/icons';
import { Layout } from '@consta/header/Layout';
import { cnMixSpace } from '@consta/uikit/MixSpace';
import { User } from '@consta/uikit/User';
import { Dropdown, MenuProps } from 'antd';
import { useUnit } from 'effector-react/compat';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import logo from '../../../public/main/logo.svg';
import cx from './styles.module.scss';

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
                await mutateAsync();
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
                        <Image src={logo.src} alt={'Лого'} layout={'fill'} objectFit={'contain'} />
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
