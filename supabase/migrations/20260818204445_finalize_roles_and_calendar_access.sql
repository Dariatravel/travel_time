-- Stage 2: all application role checks now use public.user_roles.

CREATE OR REPLACE FUNCTION public.list_assignable_users()
RETURNS TABLE (
    id uuid,
    email text,
    name text,
    role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        u.id,
        u.email::text,
        COALESCE(u.raw_user_meta_data ->> 'name', '')::text,
        r.role
    FROM auth.users AS u
    LEFT JOIN public.user_roles AS r ON r.user_id = u.id
    WHERE public.current_app_role() IN ('admin', 'operator');
$$;

REVOKE ALL ON FUNCTION public.list_assignable_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_assignable_users() TO authenticated;

DROP FUNCTION IF EXISTS public.get_raw_user_meta_data();

ALTER VIEW public.hotels_with_rooms_new SET (security_invoker = on);
