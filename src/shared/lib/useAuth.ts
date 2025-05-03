import { redirect } from 'next/navigation'
import supabase from '@/shared/config/supabase'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { setUser } from '@/shared/models/auth'
import { routes } from '@/shared/config/routes'

const getSession = async () => {
  try {
    const { data } = await supabase.auth.getSession()

    return data
  } catch (e) {
    console.error(e)
  }
}

export const useAuth = () => {
  const { data, isFetching } = useQuery({
    queryFn: getSession,
    queryKey: ['AUTH'],
  })

  useEffect(() => {
    if (isFetching) return
    // console.log(data)
    if (!data?.session) redirect(routes.LOGIN)

    const user = data?.session?.user

    console.log(user)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    setUser({
      email: user?.email,
      phone: user?.phone,
      role: user?.user_metadata?.role,
      surname: user?.user_metadata?.surname,
      name: user?.user_metadata?.name,
      user_metadata: user?.user_metadata,
    })
  }, [isFetching])
}
