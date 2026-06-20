-- Ограничение чтения reserve_history:
-- admin/operator — все записи;
-- hotel (отельер) — только брони своих объектов (hotels.user_id = auth.uid()).

CREATE OR REPLACE FUNCTION app_private.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
    SELECT COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '');
$$;

CREATE OR REPLACE FUNCTION app_private.user_can_read_reserve_history(reserve_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.reserves r
        JOIN public.rooms rm ON rm.id = r.room_id
        JOIN public.hotels h ON h.id = rm.hotel_id
        WHERE r.id = reserve_uuid
          AND (
              app_private.current_user_role() IN ('admin', 'operator')
              OR h.user_id = auth.uid()::text
          )
    );
$$;

DROP POLICY IF EXISTS reserve_history_select_authenticated ON public.reserve_history;

CREATE POLICY reserve_history_select_scoped
    ON public.reserve_history
    FOR SELECT
    TO authenticated
    USING (app_private.user_can_read_reserve_history(reserve_id));

COMMENT ON FUNCTION app_private.user_can_read_reserve_history(uuid) IS
    'Проверка доступа к истории брони: staff видит всё, отельер — только свои объекты';
