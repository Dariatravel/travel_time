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
    p_marks jsonb,
    p_source_complete boolean DEFAULT false,
    p_confirm_empty boolean DEFAULT false,
    p_min_retained_ratio numeric DEFAULT 0.5,
    p_confirm_large_decrease boolean DEFAULT false
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
    v_existing_count integer := 0;
    v_proposed_count integer := 0;
    v_retained_ratio numeric;
    v_safety_error_code text;
    v_safety_error text;
BEGIN
    IF p_source IS NULL OR btrim(p_source) = '' OR p_room_ids IS NULL
       OR cardinality(p_room_ids) = 0 OR p_marks IS NULL
       OR jsonb_typeof(p_marks) <> 'array' OR p_source_complete IS NULL
       OR p_confirm_empty IS NULL OR p_min_retained_ratio IS NULL
       OR p_min_retained_ratio < 0 OR p_min_retained_ratio > 1
       OR p_confirm_large_decrease IS NULL THEN
        RAISE EXCEPTION 'Invalid external sync payload';
    END IF;

    SELECT r.hotel_id
    INTO v_hotel_id
    FROM public.rooms AS r
    WHERE r.id = ANY(p_room_ids)
    LIMIT 1;

    IF v_hotel_id IS NULL OR EXISTS (
        SELECT 1
        FROM unnest(p_room_ids) AS requested(room_id)
        LEFT JOIN public.rooms AS r ON r.id = requested.room_id
        WHERE r.id IS NULL OR r.hotel_id <> v_hotel_id
    ) THEN
        RAISE EXCEPTION 'All synced rooms must belong to one hotel';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_marks) AS m(
            room_id uuid,
            start_at bigint,
            end_at bigint
        )
        WHERE m.room_id IS NULL OR NOT (m.room_id = ANY(p_room_ids))
           OR m.start_at IS NULL OR m.end_at IS NULL OR m.start_at >= m.end_at
    ) THEN
        RAISE EXCEPTION 'Invalid external sync mark';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_source || ':' || v_hotel_id::text, 0));

    SELECT count(*)
    INTO v_existing_count
    FROM public.reserves
    WHERE external_source = p_source AND room_id = ANY(p_room_ids);

    v_proposed_count := jsonb_array_length(p_marks);
    v_retained_ratio := CASE
        WHEN v_existing_count > 0 THEN v_proposed_count::numeric / v_existing_count
        ELSE NULL
    END;

    INSERT INTO public.sync_runs (source, hotel_id, status)
    VALUES (p_source, v_hotel_id, 'ok')
    RETURNING id INTO v_run_id;

    IF NOT p_source_complete THEN
        v_safety_error_code := 'source_incomplete';
        v_safety_error := 'Источник iCal вернул неполный ответ; текущая занятость сохранена';
    ELSIF v_existing_count > 0 AND v_proposed_count = 0 AND NOT p_confirm_empty THEN
        v_safety_error_code := 'empty_unconfirmed';
        v_safety_error := 'Источник iCal не подтвердил пустой календарь; текущая занятость сохранена';
    ELSIF v_existing_count > 0 AND v_proposed_count > 0
          AND v_retained_ratio < p_min_retained_ratio
          AND NOT p_confirm_large_decrease THEN
        v_safety_error_code := 'suspicious_decrease';
        v_safety_error := 'Число iCal-меток подозрительно уменьшилось: '
            || v_existing_count || ' -> ' || v_proposed_count
            || '; текущая занятость сохранена';
    END IF;

    IF v_safety_error IS NOT NULL THEN
        UPDATE public.sync_runs
        SET finished_at = now(),
            status = 'error',
            counts = jsonb_build_object(
                'existing', v_existing_count,
                'proposed', v_proposed_count,
                'retained_ratio', v_retained_ratio,
                'min_retained_ratio', p_min_retained_ratio,
                'source_complete', p_source_complete,
                'confirmed_empty', p_confirm_empty,
                'confirmed_large_decrease', p_confirm_large_decrease
            ),
            error = v_safety_error
        WHERE id = v_run_id;

        RETURN jsonb_build_object(
            'status', 'error',
            'error_code', v_safety_error_code,
            'error', v_safety_error,
            'inserted', 0,
            'skipped_manual', 0,
            'skipped_past', 0,
            'conflicts', 0,
            'existing', v_existing_count,
            'proposed', v_proposed_count
        );
    END IF;

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
    )
    SELECT count(*)
    INTO v_skipped_manual
    FROM marks AS m
    WHERE EXISTS (
        SELECT 1
        FROM public.reserves AS r
        WHERE r.room_id = m.room_id
          AND r.external_source IS NULL
          AND public.booking_night_range(r.start, r."end")
              && public.booking_night_range(m.start_at, m.end_at)
    );

    DELETE FROM public.reserves
    WHERE external_source = p_source AND room_id = ANY(p_room_ids);

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
    )
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
        SELECT 1
        FROM public.reserves AS r
        WHERE r.room_id = m.room_id
          AND r.external_source IS NULL
          AND public.booking_night_range(r.start, r."end")
              && public.booking_night_range(m.start_at, m.end_at)
    );

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    UPDATE public.sync_runs
    SET finished_at = now(),
        status = CASE WHEN v_skipped_manual > 0 THEN 'partial' ELSE 'ok' END,
        counts = jsonb_build_object(
            'inserted', v_inserted,
            'skipped_manual', v_skipped_manual,
            'skipped_past', 0,
            'conflicts', v_skipped_manual,
            'existing', v_existing_count,
            'proposed', v_proposed_count,
            'retained_ratio', v_retained_ratio,
            'min_retained_ratio', p_min_retained_ratio,
            'source_complete', p_source_complete,
            'confirmed_empty', p_confirm_empty,
            'confirmed_large_decrease', p_confirm_large_decrease
        )
    WHERE id = v_run_id;

    RETURN jsonb_build_object(
        'status', CASE WHEN v_skipped_manual > 0 THEN 'partial' ELSE 'ok' END,
        'inserted', v_inserted,
        'skipped_manual', v_skipped_manual,
        'skipped_past', 0,
        'conflicts', v_skipped_manual
    );
END;
$$;

REVOKE ALL ON TABLE public.sync_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_external_occupancy(text, uuid[], jsonb, boolean, boolean, numeric, boolean)
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.sync_runs TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_external_occupancy(text, uuid[], jsonb, boolean, boolean, numeric, boolean)
    TO service_role;
