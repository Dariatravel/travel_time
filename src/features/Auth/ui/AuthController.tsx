'use client';
import supabase from '@/shared/config/supabase';
import { redirect } from 'next/navigation';
import React from 'react';

export interface AuthControllerProps {
    children?: React.ReactNode;
    className?: string;
}

export const useAuthSession = async ({ className, children }: AuthControllerProps) => {
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session) redirect('/login');
};
