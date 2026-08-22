-- Stage 0: immediately stop exposing every user's raw metadata.
-- This transitional function intentionally reads the existing role claim only until
-- Stage 1 moves authorization to public.user_roles.

REVOKE ALL ON FUNCTION public.get_raw_user_meta_data() FROM PUBLIC, anon, authenticated;

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
        (u.raw_user_meta_data ->> 'role')::text
    FROM auth.users AS u
    WHERE COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'operator');
$$;

REVOKE ALL ON FUNCTION public.list_assignable_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_assignable_users() TO authenticated;

COMMENT ON FUNCTION public.list_assignable_users() IS
    'Temporary staff-only owner selector. Stage 2 replaces the user_metadata role check with current_app_role().';
