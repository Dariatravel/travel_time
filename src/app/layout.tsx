'use client';

import { SafeHydrate } from '@/components/SafeHydrate/SafeHydrate';
import { EffectorLogger } from '@/features/EffectorLogger';
import '@/features/lib/zIndexes.css';
import { cn } from '@/lib/utils';
import { queryClient } from '@/shared/config/reactQuery';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import moment from 'moment';
import 'moment/locale/ru';
import { Geist, Geist_Mono } from 'next/font/google';
import React from 'react';
import './globals.css';
import styles from './styles.module.css';

moment.locale('ru'); // Для локализации дат

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

moment.locale('ru');

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <head>
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
                />
            </head>
            <body className={`${geistSans.variable} ${geistMono.variable}`}>
                {process.env.NODE_ENV === 'development' && <EffectorLogger />}

                <QueryClientProvider client={queryClient}>
                    <SafeHydrate>
                        <div className={cn(styles.layout, 'min-h-screen')}>{children}</div>
                    </SafeHydrate>
                    <ReactQueryDevtools />
                </QueryClientProvider>
            </body>
        </html>
    );
}
