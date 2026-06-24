CREATE TABLE IF NOT EXISTS public.realtycalendar_webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    received_at timestamptz NOT NULL DEFAULT now(),
    action text,
    status text,
    booking_id text,
    room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
    rc_room_id text,
    rc_realty_id text,
    result_status text NOT NULL,
    result_reason text,
    payload jsonb,
    conflicts jsonb
);

CREATE INDEX IF NOT EXISTS realtycalendar_webhook_events_received_at_idx
    ON public.realtycalendar_webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS realtycalendar_webhook_events_booking_id_idx
    ON public.realtycalendar_webhook_events (booking_id);

CREATE INDEX IF NOT EXISTS realtycalendar_webhook_events_result_status_idx
    ON public.realtycalendar_webhook_events (result_status);

ALTER TABLE public.realtycalendar_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.realtycalendar_webhook_events FROM anon, authenticated;
