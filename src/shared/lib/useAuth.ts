import { routes } from '@/shared/config/routes';
import supabase from '@/shared/config/supabase';
import { setUser } from '@/shared/models/auth';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { devLog } from './logger';

const getSession = async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
        throw error;
    }

    return data;
};

export const useAuth = () => {
    const router = useRouter();
    const { data, isFetching } = useQuery({
        queryFn: getSession,
        queryKey: ['AUTH'],
    });

    useEffect(() => {
        if (isFetching) return;
        if (!data) return;
        if (!data.session) {
            router.replace(routes.LOGIN);
            return;
        }

        const user = data?.session?.user;

        devLog('user', user);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        setUser({
            email: user?.email,
            phone: user?.phone,
            role: user?.user_metadata?.role,
            surname: user?.user_metadata?.surname,
            name: user?.user_metadata?.name,
            user_metadata: user?.user_metadata,
        });
    }, [data, isFetching, router]);
};
