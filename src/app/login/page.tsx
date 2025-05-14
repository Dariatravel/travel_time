'use client'
import React, { useEffect } from 'react'
import { Login } from '@/features/Auth/ui/Login'
import { Register } from '@/features/Auth/ui/Register'
import { Tabs, TabsProps } from 'antd'
import { Card } from '@consta/uikit/Card'
import { setUser } from '@/shared/models/auth'
import style from './style.module.scss'

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
]

export default function LoginPage() {
  const onChange = (key: string) => {
    console.log(key)
  }

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    setUser(null)
  }, [])

  return (
    <Card
      className={style.card}
      style={{
        padding: '1rem',
        maxWidth: '568px',
        minWidth: '568px',
        position: 'relative',
      }}
    >
      <Tabs
        defaultActiveKey="1"
        items={items}
        onChange={onChange}
        style={{ width: '100%' }}
      />
    </Card>
  )
}
