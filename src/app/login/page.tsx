'use client';
import { Login } from '@/features/Auth/ui/Login';
import { Register } from '@/features/Auth/ui/Register';
import { devLog } from '@/shared/lib/logger';
import { setUser } from '@/shared/models/auth';
import { Card } from '@consta/uikit/Card';
import { Tabs, TabsProps } from 'antd';
import { useEffect } from 'react';
import style from './style.module.scss';

const items: TabsProps['items'] = [
    {
        key: '1',
        label: 'Вход',
        children: <Login />,
    },
    {
        key: '2',
        label: 'Регистрация',
        children: <Register />,
    },
];

export default function LoginPage() {
    const onChange = (key: string) => {
        devLog('LoginPage', key);
    };

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        setUser(null);
    }, []);

    return (
        <Card className={style.card}>
            <Tabs defaultActiveKey="1" items={items} onChange={onChange} style={{ width: '100%' }} />
        </Card>
    );
}
