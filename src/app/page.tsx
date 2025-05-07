'use client';

import { useAuth } from '@/shared/lib/useAuth';
import { redirect } from 'next/navigation';

export default function Main() {
    useAuth();

    redirect('/main');
}
