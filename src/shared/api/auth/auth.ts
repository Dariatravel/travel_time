import supabase from '@/shared/config/supabase'
import { useMutation, useQuery } from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { notifyError, notifySuccess, showToast } from '@/shared/ui/Toast/Toast'
import { User } from '@supabase/auth-js'
import { Session } from '@supabase/supabase-js'

export interface AuthProps {
  email: string
  password: string
}

export type TravelUser = User['user_metadata']

export interface RegisterProps {
  surname: string
  name: string
  role: string
  email: string
  password: string
  phone: string
  user_metadata?: TravelUser
}

export enum UserRole {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  HOTEL = 'hotel',
}

export const login = async ({
  email,
  password,
}: {
  email: string
  password: string
}) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) {
    notifyError('Введены некорректные данные. Попробуйте ещё раз')
    return error
  }

  notifySuccess('Успешный вход!')
  redirect('/main')
}

export async function register({
  email,
  password,
  surname,
  role,
  name,
}: RegisterProps) {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: { data: { surname, role, name } },
  })
  if (error) {
    notifyError(`Ошибка регистрации ${error.message}`)
    return error
  }

  notifySuccess('Успешная регистрация!')

  redirect('/main')
}

export const getUser = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    // await setUser({
    //   email: user?.email,
    //   phone: user?.phone,
    //   role: user?.user_metadata?.role,
    //   surname: user?.user_metadata?.surname,
    //   name: user?.user_metadata?.name,
    // });
  } catch (e) {
    console.error(e)
  }
}

export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut()
  } catch (err) {
    console.log(err)
  }
}

export async function getListUsers() {
  try {
    const { data, error } = await supabase.rpc('get_raw_user_meta_data')
    return data as TravelUser[]
  } catch (e) {
    console.error(e)
  }
}

export const useLogin = () => useMutation({ mutationFn: login })
export const useRegister = () => useMutation({ mutationFn: register })
export const useSignOut = () => useMutation({ mutationFn: signOut })
export const useUser = () => useQuery({ queryFn: getUser, queryKey: ['USER'] })
export const useGetUsers = () =>
  useQuery({ queryFn: getListUsers, queryKey: ['USER'] })

export const useGetSession = () => {
  return useQuery<{ session: Session | null }>({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        showToast(`Ошибка при получении сессии: ${error.message}`, 'error')
        throw error
      }
      return data
    },
  })
}
