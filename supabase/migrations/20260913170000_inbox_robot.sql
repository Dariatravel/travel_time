-- «Входящие»: автоответ робота ОКО — не ответ (12.09.2026).
--
-- В ОКО стоит автоответчик: из 205 тысяч перенесённых сообщений 11 228
-- исходящих написаны «Robot». Если считать его ответом, чат, где клиенту
-- ответил только робот, выпадает из «Ждут ответа» — а это ровно те чаты,
-- которые Алина ищет руками. Теперь ответом считается только сообщение
-- человека, и «ждёт» считается от первого сообщения клиента после него.
--
-- Откат: применить заново функцию oko_inbox из 20260913150000_add_inbox.sql.
BEGIN;

DROP FUNCTION IF EXISTS public.oko_inbox(integer, integer);
CREATE FUNCTION public.oko_inbox(p_days integer DEFAULT 14, p_limit integer DEFAULT 200)
RETURNS TABLE (
    messenger_id      bigint,
    client_id         uuid,
    client_name       text,
    client_phones     text[],
    is_temporary      boolean,
    oko_client_id     bigint,
    integration_id    integer,
    last_text         text,
    last_direction    text,
    last_author_type  text,
    last_at           timestamptz,
    waiting_since     timestamptz,
    deal_id           uuid,
    deal_stage        text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH last_msg AS (
        SELECT DISTINCT ON (m.oko_contact_messenger_id)
               m.oko_contact_messenger_id AS messenger_id,
               m.client_id,
               m.integration_id,
               m.text,
               m.direction,
               m.author_type,
               m.sent_at
          FROM public.deal_messages AS m
         WHERE m.oko_contact_messenger_id IS NOT NULL
         ORDER BY m.oko_contact_messenger_id, m.sent_at DESC
    ),
    -- Окно p_days отсекает только переписки, где последним говорил человек
    -- с нашей стороны. Неотвеченные (клиент или робот) показываем всегда.
    page AS (
        SELECT * FROM last_msg
         WHERE direction = 'in'
            OR COALESCE(author_type, '') IN ('robot', 'bot')
            OR sent_at >= now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 14), 365)))
         ORDER BY sent_at DESC
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))
    )
    SELECT l.messenger_id,
           l.client_id,
           c.name,
           c.phones,
           c.oko_contact_id IS NULL AS is_temporary,
           c.oko_client_ids[1],
           l.integration_id,
           left(COALESCE(l.text, ''), 300),
           l.direction,
           l.author_type,
           l.sent_at,
           w.since AS waiting_since,
           d.id,
           d.stage
      FROM page AS l
      LEFT JOIN public.clients AS c ON c.id = l.client_id
      -- Первое сообщение клиента после нашего последнего ЧЕЛОВЕЧЕСКОГО ответа.
      LEFT JOIN LATERAL (
            SELECT min(i.sent_at) AS since
              FROM public.deal_messages AS i
             WHERE i.oko_contact_messenger_id = l.messenger_id
               AND i.direction = 'in'
               AND i.sent_at > COALESCE((
                       SELECT max(o.sent_at)
                         FROM public.deal_messages AS o
                        WHERE o.oko_contact_messenger_id = l.messenger_id
                          AND o.direction <> 'in'
                          AND COALESCE(o.author_type, '') NOT IN ('robot', 'bot')
                   ), '-infinity'::timestamptz)
      ) AS w ON true
      LEFT JOIN LATERAL (
            SELECT dl.id, dl.stage
              FROM public.deals AS dl
             WHERE dl.client_id = l.client_id
             ORDER BY dl.updated_at DESC
             LIMIT 1
      ) AS d ON true
     ORDER BY l.sent_at DESC
$$;

REVOKE ALL ON FUNCTION public.oko_inbox(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oko_inbox(integer, integer) TO authenticated;

COMMIT;
