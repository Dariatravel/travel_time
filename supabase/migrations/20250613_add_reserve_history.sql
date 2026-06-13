-- История изменений брони.
-- Безопасный принцип:
-- - клиент только читает public.reserve_history;
-- - запись выполняется триггером через функции в приватной схеме;
-- - удаление брони не логируем, чтобы не блокировать delete из-за FK на reserves.

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE TABLE IF NOT EXISTS public.reserve_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reserve_id uuid NOT NULL REFERENCES public.reserves(id) ON DELETE CASCADE,
    action text NOT NULL CHECK (action IN ('created', 'updated')),
    changed_by text,
    changed_at timestamptz NOT NULL DEFAULT now(),
    changes jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS reserve_history_reserve_id_changed_at_idx
    ON public.reserve_history (reserve_id, changed_at DESC);

COMMENT ON TABLE public.reserve_history IS 'История создания и изменений бронирований';

CREATE OR REPLACE FUNCTION app_private.build_reserve_changes(
    old_row public.reserves,
    new_row public.reserves
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    result jsonb := '[]'::jsonb;
BEGIN
    IF old_row.start IS DISTINCT FROM new_row.start THEN
        result := result || jsonb_build_array(jsonb_build_object(
            'field', 'start', 'old', old_row.start, 'new', new_row.start
        ));
    END IF;

    IF old_row."end" IS DISTINCT FROM new_row."end" THEN
        result := result || jsonb_build_array(jsonb_build_object(
            'field', 'end', 'old', old_row."end", 'new', new_row."end"
        ));
    END IF;

    IF old_row.room_id IS DISTINCT FROM new_row.room_id THEN
        result := result || jsonb_build_array(jsonb_build_object(
            'field', 'room_id', 'old', old_row.room_id, 'new', new_row.room_id
        ));
    END IF;

    IF old_row.guest IS DISTINCT FROM new_row.guest THEN
        result := result || jsonb_build_array(jsonb_build_object(
            'field', 'guest', 'old', old_row.guest, 'new', new_row.guest
        ));
    END IF;

    IF old_row.phone IS DISTINCT FROM new_row.phone THEN
        result := result || jsonb_build_array(jsonb_build_object(
            'field', 'phone', 'old', old_row.phone, 'new', new_row.phone
        ));
    END IF;

    IF old_row.price IS DISTINCT FROM new_row.price THEN
        result := result || jsonb_build_array(jsonb_build_object(
            'field', 'price', 'old', old_row.price, 'new', new_row.price
        ));
    END IF;

    IF old_row.quantity IS DISTINCT FROM new_row.quantity THEN
        result := result || jsonb_build_array(jsonb_build_object(
            'field', 'quantity', 'old', old_row.quantity, 'new', new_row.quantity
        ));
    END IF;

    IF old_row.prepayment IS DISTINCT FROM new_row.prepayment THEN
        result := result || jsonb_build_array(jsonb_build_object(
            'field', 'prepayment', 'old', old_row.prepayment, 'new', new_row.prepayment
        ));
    END IF;

    IF old_row.comment IS DISTINCT FROM new_row.comment THEN
        result := result || jsonb_build_array(jsonb_build_object(
            'field', 'comment', 'old', old_row.comment, 'new', new_row.comment
        ));
    END IF;

    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.log_reserve_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
    history_action text;
    history_actor text;
    history_changes jsonb := '[]'::jsonb;
BEGIN
    IF TG_OP = 'INSERT' THEN
        history_action := 'created';
        history_actor := NEW.created_by;
    ELSIF TG_OP = 'UPDATE' THEN
        history_changes := app_private.build_reserve_changes(OLD, NEW);

        IF jsonb_array_length(history_changes) = 0 THEN
            RETURN NEW;
        END IF;

        history_action := 'updated';
        history_actor := NEW.edited_by;
    END IF;

    INSERT INTO public.reserve_history (
        reserve_id,
        action,
        changed_by,
        changed_at,
        changes
    )
    VALUES (
        NEW.id,
        history_action,
        history_actor,
        now(),
        history_changes
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reserves_history_trigger ON public.reserves;

CREATE TRIGGER reserves_history_trigger
    AFTER INSERT OR UPDATE ON public.reserves
    FOR EACH ROW
    EXECUTE FUNCTION app_private.log_reserve_history();

ALTER TABLE public.reserve_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reserve_history_select_authenticated ON public.reserve_history;

CREATE POLICY reserve_history_select_authenticated
    ON public.reserve_history
    FOR SELECT
    TO authenticated
    USING (true);
