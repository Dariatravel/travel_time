CREATE TABLE public.sync_alert_states (
    alert_key text PRIMARY KEY,
    fingerprint text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    last_alerted_at timestamptz,
    resolved_at timestamptz,
    details jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.sync_alert_states ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_sync_freshness_snapshot(
    p_error_window_hours numeric DEFAULT 1,
    p_default_stale_hours numeric DEFAULT 8,
    p_stale_hours_by_source jsonb DEFAULT '{}'::jsonb,
    p_monitored_sources text[] DEFAULT ARRAY[]::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_failures jsonb;
    v_stale jsonb;
BEGIN
    IF p_error_window_hours <= 0 OR p_default_stale_hours <= 0
       OR p_stale_hours_by_source IS NULL
       OR jsonb_typeof(p_stale_hours_by_source) <> 'object'
       OR p_monitored_sources IS NULL THEN
        RAISE EXCEPTION 'Invalid sync freshness settings';
    END IF;

    WITH latest_failures AS (
        SELECT DISTINCT ON (sr.source, sr.hotel_id)
            sr.id AS run_id,
            sr.source,
            sr.hotel_id,
            h.title AS hotel_title,
            sr.status,
            COALESCE(sr.finished_at, sr.started_at) AS occurred_at,
            sr.counts,
            sr.error
        FROM public.sync_runs AS sr
        JOIN public.hotels AS h ON h.id = sr.hotel_id
        WHERE sr.status <> 'ok'
          AND COALESCE(sr.finished_at, sr.started_at)
              >= now() - (p_error_window_hours * interval '1 hour')
        ORDER BY sr.source, sr.hotel_id, COALESCE(sr.finished_at, sr.started_at) DESC
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(latest_failures) ORDER BY occurred_at DESC), '[]'::jsonb)
    INTO v_failures
    FROM latest_failures;

    WITH monitored_runs AS (
        SELECT
            sr.source,
            sr.hotel_id,
            min(sr.started_at) AS first_seen_at,
            max(COALESCE(sr.finished_at, sr.started_at)) FILTER (WHERE sr.status = 'ok') AS last_success_at
        FROM public.sync_runs AS sr
        WHERE sr.source = ANY(p_monitored_sources)
        GROUP BY sr.source, sr.hotel_id
    ),
    latest_runs AS (
        SELECT DISTINCT ON (sr.source, sr.hotel_id)
            sr.source,
            sr.hotel_id,
            sr.status AS last_run_status,
            COALESCE(sr.finished_at, sr.started_at) AS last_run_at
        FROM public.sync_runs AS sr
        WHERE sr.source = ANY(p_monitored_sources)
        ORDER BY sr.source, sr.hotel_id, COALESCE(sr.finished_at, sr.started_at) DESC
    ),
    freshness AS (
        SELECT
            mr.source,
            mr.hotel_id,
            h.title AS hotel_title,
            mr.last_success_at,
            lr.last_run_status,
            lr.last_run_at,
            COALESCE(
                (p_stale_hours_by_source ->> mr.source)::numeric,
                p_default_stale_hours
            ) AS max_age_hours,
            round(
                extract(epoch FROM (now() - COALESCE(mr.last_success_at, mr.first_seen_at)))::numeric / 3600,
                1
            ) AS hours_since_success
        FROM monitored_runs AS mr
        JOIN latest_runs AS lr USING (source, hotel_id)
        JOIN public.hotels AS h ON h.id = mr.hotel_id
    ),
    stale_sources AS (
        SELECT *
        FROM freshness
        WHERE hours_since_success > max_age_hours
    )
    SELECT COALESCE(
        jsonb_agg(to_jsonb(stale_sources) ORDER BY hours_since_success DESC),
        '[]'::jsonb
    )
    INTO v_stale
    FROM stale_sources;

    RETURN jsonb_build_object(
        'checked_at', now(),
        'failures', v_failures,
        'stale', v_stale
    );
END;
$$;

REVOKE ALL ON TABLE public.sync_alert_states FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_sync_freshness_snapshot(numeric, numeric, jsonb, text[])
    FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.sync_alert_states TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sync_freshness_snapshot(numeric, numeric, jsonb, text[])
    TO service_role;
