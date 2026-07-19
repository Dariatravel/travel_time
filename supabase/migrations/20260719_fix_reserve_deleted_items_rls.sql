-- Корзина удалённых броней: INSERT должен быть доступен всем, кто может удалять бронь.
-- Раньше политика разрешала только admin/operator, а отельеры удалять свои брони могут
-- (см. RLS на public.reserves) — из-за этого бэкап падал и удаление отменялось.
-- SELECT/UPDATE/DELETE корзины оставляем только staff (операционный центр / восстановление).

CREATE OR REPLACE FUNCTION app_private.uuid_or_null(value text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT CASE
        WHEN value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN value::uuid
        ELSE NULL
    END;
$$;

DROP POLICY IF EXISTS reserve_deleted_items_staff_all ON public.reserve_deleted_items;
DROP POLICY IF EXISTS reserve_deleted_items_select_staff ON public.reserve_deleted_items;
DROP POLICY IF EXISTS reserve_deleted_items_update_staff ON public.reserve_deleted_items;
DROP POLICY IF EXISTS reserve_deleted_items_delete_staff ON public.reserve_deleted_items;
DROP POLICY IF EXISTS reserve_deleted_items_insert_scoped ON public.reserve_deleted_items;

CREATE POLICY reserve_deleted_items_select_staff
    ON public.reserve_deleted_items
    FOR SELECT
    TO authenticated
    USING (
        COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'operator')
    );

CREATE POLICY reserve_deleted_items_update_staff
    ON public.reserve_deleted_items
    FOR UPDATE
    TO authenticated
    USING (
        COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'operator')
    )
    WITH CHECK (
        COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'operator')
    );

CREATE POLICY reserve_deleted_items_delete_staff
    ON public.reserve_deleted_items
    FOR DELETE
    TO authenticated
    USING (
        COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'operator')
    );

CREATE POLICY reserve_deleted_items_insert_scoped
    ON public.reserve_deleted_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            SELECT ((auth.jwt() -> 'user_metadata' ->> 'role') = ANY (ARRAY['admin'::text, 'operator'::text]))
        )
        OR (
            (SELECT auth.uid()) = (
                SELECT hotels.user_id
                FROM public.hotels
                JOIN public.rooms ON rooms.hotel_id = hotels.id
                WHERE rooms.id = app_private.uuid_or_null(reserve_data ->> 'room_id')
                LIMIT 1
            )
        )
        OR (
            (SELECT auth.uid()) = (
                SELECT hotels.user_id
                FROM public.hotels
                WHERE hotels.id = COALESCE(
                    app_private.uuid_or_null(hotel_data ->> 'id'),
                    app_private.uuid_or_null(room_data ->> 'hotel_id')
                )
                LIMIT 1
            )
        )
    );

COMMENT ON POLICY reserve_deleted_items_insert_scoped ON public.reserve_deleted_items IS
    'Staff и отельер своего объекта могут сохранить бэкап перед удалением брони';
