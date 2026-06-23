import { createClient } from '@supabase/supabase-js';

const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const getSupabaseUrl = () => {
    const upstreamUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!upstreamUrl) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
    }

    const useGatewayProxy = process.env.NEXT_PUBLIC_USE_YANDEX_BACKEND_PROXY === 'true';

    if (useGatewayProxy && typeof window !== 'undefined') {
        return `${window.location.origin}/api/yandex-backend/gateway`;
    }

    return upstreamUrl;
};

export default createClient(getSupabaseUrl(), supabaseAnonKey!);
