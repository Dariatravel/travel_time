'use client';

import { Geist, Geist_Mono } from 'next/font/google';
import { Theme, ThemePreset } from '@consta/uikit/Theme';
import React from 'react';
import '@consta/themes/Theme_color_highlightsGreenDefault';
import '../shared/ui/globals.css';
import '@/features/lib/zIndexes.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/shared/config/reactQuery';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import moment from 'moment';
import { ConfigProvider } from 'antd';
import { SafeHydrate } from '@/components/SafeHydrate/SafeHydrate';
import styles from './styles.module.css';
import 'moment/locale/ru';

moment.locale('ru'); // Для локализации дат

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

const preset: ThemePreset = {
    color: {
        primary: 'highlightsGreenDefault', //основная цветовая схема, указано значение модификатора _color
        accent: 'highlightsGreenDefault', //акцентная цветовая схема, указано значение модификатора _color
        invert: 'highlightsGreenDefault', //инвертная цветовая схема, указывается значение модификатора _color
    },
    control: 'gpnDefault', // указывается значение модификатора _control
    font: 'gpnDefault', // указывается значение модификатора _font
    size: 'gpnDefault', // указывается значение модификатора _size
    space: 'gpnDefault', // указывается значение модификатора _space
    shadow: 'gpnDefault', // указывается значение модификатора _shadow
};

moment.locale('ru');

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </head>
            <body className={`${geistSans.variable} ${geistMono.variable}`}>
                <ConfigProvider
                    theme={{
                        token: {
                            // Seed Token
                            colorLink: '#00b96b',
                            colorPrimary: '#00b96b',
                            borderRadius: 2,

                            // Alias Token
                            colorBgContainer: '#f6ffed',
                        },
                    }}
                >
                    <QueryClientProvider client={queryClient}>
                        <Theme preset={preset}>
                            <SafeHydrate>
                                <div className={styles.layout} />
                                {children}
                            </SafeHydrate>
                        </Theme>
                        <ReactQueryDevtools />
                    </QueryClientProvider>
                </ConfigProvider>
            </body>
        </html>
    );
}
