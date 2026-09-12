-- Надёжный приём сообщений из ОКО (14.09.2026).
--
-- Находки внешнего ревью:
--  * при сбое записи в базу приём отвечал ОКО «200 ОК» — событие терялось молча;
--  * событие, сохранённое но не разобранное, никто не разбирал повторно;
--  * last_incoming_at записывалось без проверки и могло откатиться назад,
--    если событие пришло с опозданием;
--  * подпись вебхука в рабочем контуре не проверялась, а какие заголовки
--    ОКО реально присылает — неизвестно.
--
-- Здесь: счётчик попыток и заголовки в журнале событий, функция безопасного
-- обновления «последнего письма», функция выдачи событий на повторный разбор.
--
-- Откат: ALTER TABLE public.oko_webhook_events DROP COLUMN attempts,
-- DROP COLUMN headers, DROP COLUMN next_try_at; DROP FUNCTION
-- public.oko_touch_last_incoming(uuid, timestamptz), public.oko_events_to_retry(integer).
BEGIN;

ALTER TABLE public.oko_webhook_events
    ADD COLUMN IF NOT EXISTS attempts    integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_try_at timestamptz,
    -- Заголовки нужны, чтобы увидеть, подписывает ли ОКО запросы и как
    -- называется заголовок подписи. Значение подписи не секрет сам по себе,
    -- но токен доступа в заголовки не попадает — он в адресе.
    ADD COLUMN IF NOT EXISTS headers     jsonb;

CREATE INDEX IF NOT EXISTS oko_webhook_events_retry_idx
    ON public.oko_webhook_events (COALESCE(next_try_at, received_at))
    WHERE processed_at IS NULL;

/**
 * «Последнее письмо от клиента» — только вперёд. Событие может прийти с
 * опозданием, и тогда отметка не должна откатываться назад: на ней строится
 * экран зависших чатов.
 */
CREATE OR REPLACE FUNCTION public.oko_touch_last_incoming(p_client uuid, p_at timestamptz)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE public.clients
       SET last_incoming_at = GREATEST(COALESCE(last_incoming_at, p_at), p_at),
           updated_at = now()
     WHERE id = p_client
       AND (last_incoming_at IS NULL OR last_incoming_at < p_at);
$$;

REVOKE ALL ON FUNCTION public.oko_touch_last_incoming(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_touch_last_incoming(uuid, timestamptz) TO service_role;

/**
 * Выдать события на повторный разбор: сохранённые, но не разобранные.
 * Каждая выдача увеличивает счётчик попыток и отодвигает следующую попытку
 * (1, 5, 25 минут…). После десяти попыток событие остаётся в списке ошибок
 * и ждёт человека — бесконечно долбиться в него бессмысленно.
 */
CREATE OR REPLACE FUNCTION public.oko_events_to_retry(p_limit integer DEFAULT 20)
RETURNS TABLE (oko_message_id bigint, payload jsonb, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    WITH picked AS (
        SELECT e.oko_message_id
          FROM public.oko_webhook_events AS e
         WHERE e.processed_at IS NULL
           AND e.attempts < 10
           AND COALESCE(e.next_try_at, e.received_at) <= now()
         ORDER BY COALESCE(e.next_try_at, e.received_at)
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100))
         FOR UPDATE SKIP LOCKED
    )
    UPDATE public.oko_webhook_events AS e
       SET attempts = e.attempts + 1,
           next_try_at = now() + make_interval(mins => LEAST(power(5, e.attempts)::int, 1440))
      FROM picked
     WHERE e.oko_message_id = picked.oko_message_id
    RETURNING e.oko_message_id, e.payload, e.attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_events_to_retry(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_events_to_retry(integer) TO service_role;

COMMIT;
