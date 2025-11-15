'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Login } from '@/features/Auth/ui/Login';
import { Register } from '@/features/Auth/ui/Register';
import { cn } from '@/lib/utils';
import { devLog } from '@/shared/lib/logger';
import { setUser } from '@/shared/models/auth';
import { useEffect, useState } from 'react';
import style from './style.module.scss';

export default function LoginPage() {
    const [activeTab, setActiveTab] = useState('login');

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        devLog('LoginPage', value);
    };

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        setUser(null);
    }, []);

    return (
        <Card className={cn(style.card, 'w-full max-w-md')}>
            <CardContent className="p-4 w-full">
                <Tabs defaultValue="login" onValueChange={handleTabChange} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 text-lg">
                        <TabsTrigger
                            value="login"
                            className="text-base font-semibold cursor-pointer"
                        >
                            Вход
                        </TabsTrigger>
                        <TabsTrigger
                            value="register"
                            className="text-base font-semibold cursor-pointer"
                        >
                            Регистрация
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="login" className="mt-4 w-full">
                        <Login />
                    </TabsContent>
                    <TabsContent value="register" className="mt-4">
                        <Register />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
