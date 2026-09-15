'use client';

import { ObjectCardPage } from '@/features/ObjectCard';
import { useParams } from 'next/navigation';

export default function Page() {
    const params = useParams();
    const id = typeof params?.id === 'string' ? params.id : '';

    return <ObjectCardPage hotelId={id} />;
}
