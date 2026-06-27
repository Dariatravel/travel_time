-- Доступ Операционного центра к логам RealtyCalendar.
-- Таблица остаётся закрытой для anon; читать её могут только admin/operator.

GRANT SELECT ON public.realtycalendar_webhook_events TO authenticated;

DROP POLICY IF EXISTS realtycalendar_webhook_events_staff_select
    ON public.realtycalendar_webhook_events;

CREATE POLICY realtycalendar_webhook_events_staff_select
    ON public.realtycalendar_webhook_events
    FOR SELECT
    TO authenticated
    USING (
        COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'operator')
    );
