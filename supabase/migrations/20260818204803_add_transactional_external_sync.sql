CREATE TABLE public.sync_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source text NOT NULL,
    hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    status text NOT NULL CHECK (status IN ('ok', 'partial', 'error')),
    counts jsonb NOT NULL DEFAULT '{}'::jsonb,
    error text
);

CREATE INDEX sync_runs_source_hotel_finished_idx
    ON public.sync_runs (source, hotel_id, finished_at DESC);
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sync_external_occupancy(
    p_source text,
    p_room_ids uuid[],
    p_marks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_hotel_id uuid;
    v_inserted integer := 0;
    v_skipped_manual integer := 0;
    v_run_id uuid;
BEGIN
    IF p_source IS NULL OR btrim(p_source) = '' OR cardinality(p_room_ids) = 0
       OR jsonb_typeof(p_marks) <> 'array' THEN
        RAISE EXCEPTION 'Invalid external sync payload';
    END IF;

    SELECT min(r.hotel_id)
    INTO v_hotel_id
    FROM public.rooms AS r
    WHERE r.id = ANY(p_room_ids);

    IF v_hotel_id IS NULL OR EXISTS (
        SELECT 1 FROM public.rooms AS r
        WHERE r.id = ANY(p_room_ids) AND r.hotel_id <> v_hotel_id
    ) THEN
        RAISE EXCEPTION 'All synced rooms must belong to one hotel';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_source || ':' || v_hotel_id::text, 0));
    INSERT INTO public.sync_runs (source, hotel_id, status)
    VALUES (p_source, v_hotel_id, 'ok')
    RETURNING id INTO v_run_id;

    WITH marks AS (
        SELECT *
        FROM jsonb_to_recordset(p_marks) AS m(
            room_id uuid,
            start_at bigint,
            end_at bigint,
            guest text,
            comment text,
            external_uid text,
            external_feed_url text
        )
        WHERE m.room_id = ANY(p_room_ids) AND m.start_at < m.end_at
    ),
    conflicting AS (
        SELECT m.*
        FROM marks AS m
        WHERE EXISTS (
            SELECT 1
            FROM public.reserves AS r
            WHERE r.room_id = m.room_id
              AND r.external_source IS NULL
              AND public.booking_night_range(r.start, r."end")
                  && public.booking_night_range(m.start_at, m.end_at)
        )
    ),
    deletions AS (
        DELETE FROM public.reserves
        WHERE external_source = p_source AND room_id = ANY(p_room_ids)
    ),
    inserted AS (
        INSERT INTO public.reserves (
            room_id, start, "end", guest, phone, price, quantity, comment,
            created_by, edited_by, edited_at, external_source, external_uid,
            external_feed_url, external_synced_at
        )
        SELECT
            m.room_id, m.start_at, m.end_at, COALESCE(m.guest, 'Внешняя занятость'),
            '', 0, 1, COALESCE(m.comment, ''), p_source, p_source, now(), p_source,
            COALESCE(m.external_uid, p_source || ':' || m.room_id || ':' || m.start_at || '-' || m.end_at),
            m.external_feed_url, now()
        FROM marks AS m
        WHERE NOT EXISTS (
            SELECT 1 FROM conflicting AS c
            WHERE c.room_id = m.room_id AND c.start_at = m.start_at AND c.end_at = m.end_at
        )
        RETURNING id
    )
    SELECT
        (SELECT count(*) FROM inserted),
        (SELECT count(*) FROM conflicting)
    INTO v_inserted, v_skipped_manual;

    UPDATE public.sync_runs
    SET finished_at = now(),
        status = CASE WHEN v_skipped_manual > 0 THEN 'partial' ELSE 'ok' END,
        counts = jsonb_build_object(
            'inserted', v_inserted,
            'skipped_manual', v_skipped_manual,
            'skipped_past', 0,
            'conflicts', v_skipped_manual
        )
    WHERE id = v_run_id;

    RETURN jsonb_build_object(
        'inserted', v_inserted,
        'skipped_manual', v_skipped_manual,
        'skipped_past', 0,
        'conflicts', v_skipped_manual
    );
END;
$$;

REVOKE ALL ON TABLE public.sync_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_external_occupancy(text, uuid[], jsonb)
    FROM PUBLIC, anon, authenticated;
