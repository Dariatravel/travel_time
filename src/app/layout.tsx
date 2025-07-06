'use client'

import { SafeHydrate } from '@/components/SafeHydrate/SafeHydrate'
import '@/features/lib/zIndexes.css'
import { queryClient } from '@/shared/config/reactQuery'
import '@/shared/ui/globals.scss'
import '@consta/themes/Theme_color_highlightsGreenDefault'
import { Theme, ThemePreset } from '@consta/uikit/Theme'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ConfigProvider } from 'antd'
import moment from 'moment'
import 'moment/locale/ru'
import { Geist, Geist_Mono } from 'next/font/google'
import React from 'react'
import styles from './styles.module.css'

moment.locale('ru') // Для локализации дат

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

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
}

moment.locale('ru')

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
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
        <ConfigProvider
          theme={{
            token: {
              // Seed Token
              colorLink: '#00b96b',
              colorPrimary: '#00b96b',
              borderRadius: 4,
              fontSize: 16,

              // Alias Token
              // colorBgContainer: '#f6ffed',
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
  )
}
