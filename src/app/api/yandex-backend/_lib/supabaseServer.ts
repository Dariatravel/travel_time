import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const createSupabaseServerClient = (authorization?: string | null) => {
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase public environment variables are not configured');
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        global: {
            headers: authorization ? { Authorization: authorization } : undefined,
        },
    });
};
