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

/**
 * Кого перечитать при сверке с ОКО.
 *
 * ОКО не отдаёт «все сообщения с такого-то времени» — только по контакту или
 * сделке, и список сделок не сортирует. Поэтому сверка идёт по кругу:
 * берём контакты, которые давно не перечитывали, начиная с тех, где недавно
 * была переписка. Отметку о сверке ставим сразу, чтобы круг двигался.
 */
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

CREATE INDEX IF NOT EXISTS clients_reconcile_idx
    ON public.clients (reconciled_at NULLS FIRST, last_incoming_at DESC NULLS LAST)
    WHERE oko_contact_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.oko_contacts_to_reconcile(p_limit integer DEFAULT 5)
RETURNS TABLE (oko_contact_id bigint, client_name text, last_incoming_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    WITH picked AS (
        SELECT c.id
          FROM public.clients AS c
         WHERE c.oko_contact_id IS NOT NULL
           AND c.last_incoming_at IS NOT NULL
           AND (c.reconciled_at IS NULL OR c.reconciled_at < now() - interval '7 days')
         ORDER BY c.reconciled_at NULLS FIRST, c.last_incoming_at DESC
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 20))
         FOR UPDATE SKIP LOCKED
    )
    UPDATE public.clients AS c
       SET reconciled_at = now()
      FROM picked
     WHERE c.id = picked.id
    RETURNING c.oko_contact_id, c.name, c.last_incoming_at;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_contacts_to_reconcile(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_contacts_to_reconcile(integer) TO service_role;

COMMIT;
