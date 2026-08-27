-- Список для назначения отеля показывал только имя («Ирина», «Алина»), из-за
-- чего одинаковые имена не различить. Фамилия есть у всех пользователей, и у
-- отельеров там обычно название отеля («Виктория Дуэт мокко») — как раз то,
-- что нужно менеджеру. Отдаём её отдельным полем, склейку делает интерфейс.
--
-- Тип возвращаемой таблицы меняется, поэтому CREATE OR REPLACE не подходит —
-- нужен DROP. Права и защита прежние: SECURITY DEFINER с пустым search_path,
-- доступ только вошедшим, данные видят лишь admin и operator.

DROP FUNCTION IF EXISTS public.list_assignable_users();

CREATE FUNCTION public.list_assignable_users()
RETURNS TABLE (
    id uuid,
    email text,
    name text,
    surname text,
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
        COALESCE(u.raw_user_meta_data ->> 'surname', '')::text,
        r.role
    FROM auth.users AS u
    LEFT JOIN public.user_roles AS r ON r.user_id = u.id
    WHERE public.current_app_role() IN ('admin', 'operator');
$$;

REVOKE ALL ON FUNCTION public.list_assignable_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_assignable_users() TO authenticated;

COMMENT ON FUNCTION public.list_assignable_users() IS
    'Список пользователей для назначения отеля. Только для admin и operator; '
    'заменяет удалённую get_raw_user_meta_data, которая отдавала метаданные всех '
    'пользователей любому анониму.';
