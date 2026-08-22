-- Rollback for 20260818204327, 20260818204404, 20260818204407 and
-- 20260818204445. This file contains the pre-rollout policy snapshot taken
-- from production on 19.08.2026; it does not depend on the current live state.
-- Deploy the matching previous application image before applying this rollback.
-- Roles created while user_roles was active are copied back to user_metadata so
-- the previous (metadata-based) policies keep working after the table is gone.

BEGIN;

ALTER VIEW public.hotels_with_rooms_new SET (security_invoker = off);

DROP POLICY IF EXISTS hotels_scoped_by_app_role ON public.hotels;
DROP POLICY IF EXISTS rooms_scoped_by_app_role ON public.rooms;
DROP POLICY IF EXISTS reserves_scoped_by_app_role ON public.reserves;
DROP POLICY IF EXISTS room_closures_select_by_app_role ON public.room_closures;
DROP POLICY IF EXISTS room_closures_insert_by_app_role ON public.room_closures;
DROP POLICY IF EXISTS room_closures_update_by_app_role ON public.room_closures;
DROP POLICY IF EXISTS room_closures_delete_by_app_role ON public.room_closures;
DROP POLICY IF EXISTS reserve_deleted_items_select_by_app_role ON public.reserve_deleted_items;
DROP POLICY IF EXISTS reserve_deleted_items_update_by_app_role ON public.reserve_deleted_items;
DROP POLICY IF EXISTS reserve_deleted_items_delete_by_app_role ON public.reserve_deleted_items;
DROP POLICY IF EXISTS reserve_deleted_items_insert_by_app_role ON public.reserve_deleted_items;
DROP POLICY IF EXISTS realtycalendar_webhook_events_select_by_app_role ON public.realtycalendar_webhook_events;

CREATE POLICY "Admin and operator can view/edit all, hotel can view/edit only "
    ON public.hotels FOR ALL TO authenticated
    USING (
        (SELECT (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'operator'))
        OR auth.uid() = user_id
    )
    WITH CHECK (
        (SELECT (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'operator'))
        OR auth.uid() = user_id
    );

CREATE POLICY "admin/operator can view/edit all; hotel can view/edit only thei"
    ON public.rooms FOR ALL TO authenticated
    USING (
        (SELECT (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'operator'))
        OR auth.uid() = (
            SELECT h.user_id FROM public.hotels AS h
            WHERE h.id = rooms.hotel_id LIMIT 1
        )
    )
    WITH CHECK (
        (SELECT (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'operator'))
        OR auth.uid() = (
            SELECT h.user_id FROM public.hotels AS h
            WHERE h.id = rooms.hotel_id LIMIT 1
        )
    );

CREATE POLICY "admin and operator view/edit all; hotel view/edit only their ow"
    ON public.reserves FOR ALL TO authenticated
    USING (
        (SELECT (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'operator'))
        OR auth.uid() = (
            SELECT h.user_id
            FROM public.hotels AS h JOIN public.rooms AS rm ON rm.hotel_id = h.id
            WHERE rm.id = reserves.room_id LIMIT 1
        )
    )
    WITH CHECK (
        (SELECT (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'operator'))
        OR auth.uid() = (
            SELECT h.user_id
            FROM public.hotels AS h JOIN public.rooms AS rm ON rm.hotel_id = h.id
            WHERE rm.id = reserves.room_id LIMIT 1
        )
    );

CREATE POLICY room_closures_select_scoped ON public.room_closures FOR SELECT TO authenticated
    USING (
        (SELECT (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'operator'))
        OR EXISTS (
            SELECT 1 FROM public.rooms AS rm JOIN public.hotels AS h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id AND h.user_id = auth.uid()
        )
    );
CREATE POLICY room_closures_insert_scoped ON public.room_closures FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'operator'))
        OR EXISTS (
            SELECT 1 FROM public.rooms AS rm JOIN public.hotels AS h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id AND h.user_id = auth.uid()
        )
    );
CREATE POLICY room_closures_update_scoped ON public.room_closures FOR UPDATE TO authenticated
    USING (
        (SELECT (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'operator'))
        OR EXISTS (
            SELECT 1 FROM public.rooms AS rm JOIN public.hotels AS h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id AND h.user_id = auth.uid()
        )
    )
    WITH CHECK (
        (SELECT (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'operator'))
        OR EXISTS (
            SELECT 1 FROM public.rooms AS rm JOIN public.hotels AS h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id AND h.user_id = auth.uid()
        )
    );
CREATE POLICY room_closures_delete_scoped ON public.room_closures FOR DELETE TO authenticated
    USING (
        (SELECT (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'operator'))
        OR EXISTS (
            SELECT 1 FROM public.rooms AS rm JOIN public.hotels AS h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id AND h.user_id = auth.uid()
        )
    );

CREATE POLICY reserve_deleted_items_select_staff ON public.reserve_deleted_items FOR SELECT TO authenticated
    USING (COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'operator'));
CREATE POLICY reserve_deleted_items_update_staff ON public.reserve_deleted_items FOR UPDATE TO authenticated
    USING (COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'operator'))
    WITH CHECK (COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'operator'));
CREATE POLICY reserve_deleted_items_delete_staff ON public.reserve_deleted_items FOR DELETE TO authenticated
    USING (COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'operator'));
CREATE POLICY reserve_deleted_items_insert_scoped ON public.reserve_deleted_items FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'operator'))
        OR auth.uid() = (
            SELECT h.user_id
            FROM public.hotels AS h JOIN public.rooms AS rm ON rm.hotel_id = h.id
            WHERE rm.id = app_private.uuid_or_null(reserve_data ->> 'room_id') LIMIT 1
        )
        OR auth.uid() = (
            SELECT h.user_id FROM public.hotels AS h
            WHERE h.id = COALESCE(
                app_private.uuid_or_null(hotel_data ->> 'id'),
                app_private.uuid_or_null(room_data ->> 'hotel_id')
            ) LIMIT 1
        )
    );

CREATE POLICY realtycalendar_webhook_events_staff_select
    ON public.realtycalendar_webhook_events FOR SELECT TO authenticated
    USING (COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'operator'));

UPDATE auth.users AS u
SET raw_user_meta_data = jsonb_set(
    COALESCE(u.raw_user_meta_data, '{}'::jsonb),
    '{role}',
    to_jsonb(r.role),
    true
)
FROM public.user_roles AS r
WHERE r.user_id = u.id;

DROP FUNCTION IF EXISTS public.list_assignable_users();
DROP TRIGGER IF EXISTS auth_users_assign_default_app_role ON auth.users;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP FUNCTION IF EXISTS public.current_app_role();
DROP FUNCTION IF EXISTS app_private.set_user_role_audit_fields();
DROP FUNCTION IF EXISTS app_private.prevent_last_admin_removal();
DROP FUNCTION IF EXISTS app_private.assign_default_app_role();

CREATE OR REPLACE FUNCTION public.get_raw_user_meta_data()
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY SELECT raw_user_meta_data FROM auth.users;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_raw_user_meta_data() TO anon, authenticated;

-- Реестр создаётся скриптом выкатки. При ручном откате его может не быть,
-- поэтому чистим запись только если таблица существует — иначе весь откат
-- падал бы уже после восстановления политик и не применялся вовсе.
DO $ledger$
BEGIN
    IF to_regclass('app_private.deployment_migrations') IS NOT NULL THEN
        DELETE FROM app_private.deployment_migrations
        WHERE name IN (
    'supabase/migrations/20260818204327_close_user_metadata_leak.sql',
    'supabase/migrations/20260818204404_create_user_roles.sql',
    'supabase/migrations/20260818204407_replace_metadata_rls.sql',
    'supabase/migrations/20260818204445_finalize_roles_and_calendar_access.sql'
);
    END IF;
END
$ledger$;

COMMIT;
