-- Возврат к версии без фамилии (как было до 27.08.2026).
-- ВНИМАНИЕ: откатывать только вместе с кодом — интерфейс новой версии ждёт
-- поле surname и без него покажет пустую подпись.

DROP FUNCTION IF EXISTS public.list_assignable_users();

CREATE FUNCTION public.list_assignable_users()
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

-- Иначе повторная выкатка решит, что миграция уже применена, и пропустит её.
DO $ledger$
BEGIN
    IF to_regclass('app_private.deployment_migrations') IS NOT NULL THEN
        DELETE FROM app_private.deployment_migrations
        WHERE name = 'supabase/migrations/20260827100000_assignable_users_with_surname.sql';
    END IF;
END
$ledger$;
