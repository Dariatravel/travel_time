-- Корзина удалённых броней для восстановления.
-- Не меняет существующую таблицу reserves и не блокирует текущую шахматку.

CREATE TABLE IF NOT EXISTS public.reserve_deleted_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reserve_id uuid NOT NULL,
    deleted_at timestamptz NOT NULL DEFAULT now(),
    deleted_by text,
    reserve_data jsonb NOT NULL,
    room_data jsonb,
    hotel_data jsonb,
    restored_at timestamptz,
    restored_by text,
    restored_reserve_id uuid
);

CREATE INDEX IF NOT EXISTS reserve_deleted_items_deleted_at_idx
    ON public.reserve_deleted_items (deleted_at DESC);

CREATE INDEX IF NOT EXISTS reserve_deleted_items_reserve_id_idx
    ON public.reserve_deleted_items (reserve_id);

CREATE INDEX IF NOT EXISTS reserve_deleted_items_restored_at_idx
    ON public.reserve_deleted_items (restored_at);

ALTER TABLE public.reserve_deleted_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reserve_deleted_items_staff_all ON public.reserve_deleted_items;

CREATE POLICY reserve_deleted_items_staff_all
    ON public.reserve_deleted_items
    FOR ALL
    TO authenticated
    USING (
        COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'operator')
    )
    WITH CHECK (
        COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'operator')
    );

COMMENT ON TABLE public.reserve_deleted_items IS
    'Корзина удалённых броней: snapshot данных перед удалением и отметка восстановления';
