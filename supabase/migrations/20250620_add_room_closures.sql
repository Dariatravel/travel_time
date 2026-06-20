-- Закрытия дат в номерах (блокировка без карточки гостя).

CREATE TABLE IF NOT EXISTS public.room_closures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    start bigint NOT NULL,
    "end" bigint NOT NULL,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text,
    edited_at timestamptz,
    edited_by text,
    CONSTRAINT room_closures_start_before_end CHECK (start < "end")
);

CREATE INDEX IF NOT EXISTS room_closures_room_id_start_idx
    ON public.room_closures (room_id, start);

COMMENT ON TABLE public.room_closures IS 'Закрытые периоды номера без бронирования гостя';

ALTER TABLE public.room_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_closures_select_scoped ON public.room_closures;
DROP POLICY IF EXISTS room_closures_insert_scoped ON public.room_closures;
DROP POLICY IF EXISTS room_closures_update_scoped ON public.room_closures;
DROP POLICY IF EXISTS room_closures_delete_scoped ON public.room_closures;

CREATE POLICY room_closures_select_scoped
    ON public.room_closures
    FOR SELECT
    TO authenticated
    USING (
        (
            SELECT ((auth.jwt() -> 'user_metadata' ->> 'role') = ANY (ARRAY['admin', 'operator']))
        )
        OR EXISTS (
            SELECT 1
            FROM public.rooms rm
            JOIN public.hotels h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id
              AND h.user_id = auth.uid()
        )
    );

CREATE POLICY room_closures_insert_scoped
    ON public.room_closures
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            SELECT ((auth.jwt() -> 'user_metadata' ->> 'role') = ANY (ARRAY['admin', 'operator']))
        )
        OR EXISTS (
            SELECT 1
            FROM public.rooms rm
            JOIN public.hotels h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id
              AND h.user_id = auth.uid()
        )
    );

CREATE POLICY room_closures_update_scoped
    ON public.room_closures
    FOR UPDATE
    TO authenticated
    USING (
        (
            SELECT ((auth.jwt() -> 'user_metadata' ->> 'role') = ANY (ARRAY['admin', 'operator']))
        )
        OR EXISTS (
            SELECT 1
            FROM public.rooms rm
            JOIN public.hotels h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id
              AND h.user_id = auth.uid()
        )
    )
    WITH CHECK (
        (
            SELECT ((auth.jwt() -> 'user_metadata' ->> 'role') = ANY (ARRAY['admin', 'operator']))
        )
        OR EXISTS (
            SELECT 1
            FROM public.rooms rm
            JOIN public.hotels h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id
              AND h.user_id = auth.uid()
        )
    );

CREATE POLICY room_closures_delete_scoped
    ON public.room_closures
    FOR DELETE
    TO authenticated
    USING (
        (
            SELECT ((auth.jwt() -> 'user_metadata' ->> 'role') = ANY (ARRAY['admin', 'operator']))
        )
        OR EXISTS (
            SELECT 1
            FROM public.rooms rm
            JOIN public.hotels h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id
              AND h.user_id = auth.uid()
        )
    );
