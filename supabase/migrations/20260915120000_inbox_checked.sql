-- «Входящие»: честный статус «ждёт ответа» (13.09.2026).
--
-- Вебхук ОКО присылает только сообщения клиентов. Проверено на рабочей базе
-- 13.09: с 10.09 пришло 1 008 событий, ни одного исходящего. Ответы,
-- написанные менеджером в самом ОКО, приносит только сверка с Mac mini — с
-- опозданием (медиана около двух часов) и пока не для всех чатов. Поэтому
-- «клиент написал последним» ещё не значит «ему не ответили»: 166 из 183
-- чатов на экране стояли «ждёт», хотя менеджеры отвечали.
--
-- Здесь:
--  * oko_chat_checks — до какого момента сверка прочитала переписку;
--    отметка двигается только вперёд (oko_mark_chats_checked);
--  * oko_inbox отдаёт checked_at: экран считает ожидание подтверждённым,
--    только если сверка (чтение по контакту) видела последнее сообщение
--    чата и было это не больше часа назад — ответ мог уйти после проверки;
--  * ответ, ушедший из АБХАЗБИЗНЕС через очередь (oko_outbox, status sent),
--    тоже снимает ожидание: в переписку он сам не записывается, а вебхук
--    исходящие не присылает.
--
-- Откат: СНАЧАЛА откатить 20260915130000_oko_waiting_targets.sql (она читает
-- oko_inbox.checked_at). Затем DROP FUNCTION public.oko_mark_chats_checked(jsonb),
-- public.oko_chat_waiting_since(bigint), public.oko_try_timestamptz(text);
-- DROP TABLE public.oko_chat_checks; применить заново oko_inbox
-- из 20260914090000_reliability_db.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public.oko_chat_checks (
    messenger_id bigint      PRIMARY KEY,
    checked_at   timestamptz NOT NULL
);

ALTER TABLE public.oko_chat_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oko_chat_checks_admin_read ON public.oko_chat_checks;
CREATE POLICY oko_chat_checks_admin_read ON public.oko_chat_checks FOR SELECT TO authenticated
    USING (public.current_app_role() = 'admin');

REVOKE ALL ON public.oko_chat_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.oko_chat_checks TO authenticated;

/** Время из текста или NULL — без ошибки на «2026-02-30» и прочем мусоре. */
CREATE OR REPLACE FUNCTION public.oko_try_timestamptz(p_value text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
    RETURN p_value::timestamptz;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_try_timestamptz(text) FROM PUBLIC, anon, authenticated;

/**
 * С какого момента клиент ждёт ответа в чате: первое его сообщение после
 * последнего ответа человека. Та же формула, что в oko_inbox — меняются
 * вместе.
 */
CREATE OR REPLACE FUNCTION public.oko_chat_waiting_since(p_messenger_id bigint)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT min(i.sent_at)
      FROM public.deal_messages AS i
     WHERE i.oko_contact_messenger_id = p_messenger_id
       AND i.direction = 'in'
       AND i.sent_at > COALESCE(GREATEST(
               (SELECT max(o.sent_at)
                  FROM public.deal_messages AS o
                 WHERE o.oko_contact_messenger_id = p_messenger_id
                   AND o.direction <> 'in'
                   AND COALESCE(o.author_type, '') NOT IN ('robot', 'bot')),
               -- Номер чата сравнивается так же, как в oko_inbox: только целое.
               (SELECT max(x.sent_at)
                  FROM public.oko_outbox AS x
                 WHERE x.kind = 'message'
                   AND x.status = 'sent'
                   AND x.sent_at IS NOT NULL
                   AND jsonb_typeof(x.payload -> 'contact_messenger_id') = 'number'
                   AND CASE WHEN (x.payload ->> 'contact_messenger_id') ~ '^[1-9][0-9]{0,17}$'
                            THEN (x.payload ->> 'contact_messenger_id')::bigint
                       END = p_messenger_id)
           ), '-infinity'::timestamptz)
$$;

REVOKE ALL ON FUNCTION public.oko_chat_waiting_since(bigint) FROM PUBLIC, anon, authenticated;

/**
 * Отметить, до какого момента сверка прочитала переписки.
 * p_checks: [{"messenger_id": 123, "checked_at": "…Z", "covers_from": "…Z"}, …]
 *
 * covers_from — самое старое сообщение чата на прочитанной странице. ОКО
 * отдаёт 20 последних сообщений контакта, и ответ менеджера может остаться на
 * второй странице. Если клиент, по нашим данным, ждёт с момента РАНЬШЕ
 * covers_from, между ними мог быть ответ, которого мы не видели — такой чат
 * не отмечается. Сравнение идёт после записи пачки: ответ, найденный на
 * странице, уже сдвинул ожидание.
 *
 * Только вперёд: запоздавшая пачка не откатывает отметку. Время из будущего
 * срезается до now(). Мусорные строки (и несуществующие даты) пропускаются.
 */
CREATE OR REPLACE FUNCTION public.oko_mark_chats_checked(p_checks jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    n integer;
BEGIN
    IF jsonb_typeof(p_checks) IS DISTINCT FROM 'array' THEN
        RETURN 0;
    END IF;

    WITH raw AS (
        SELECT e ->> 'messenger_id' AS mid, e ->> 'checked_at' AS at, e ->> 'covers_from' AS covers
          FROM jsonb_array_elements(p_checks) AS e
         WHERE jsonb_typeof(e) = 'object'
    ),
    parsed AS (
        SELECT mid::bigint AS messenger_id,
               public.oko_try_timestamptz(at) AS at,
               public.oko_try_timestamptz(covers) AS covers
          FROM raw
         WHERE mid ~ '^[1-9][0-9]{0,17}$'
           AND at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$'
           AND covers ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$'
    ),
    merged AS (
        SELECT messenger_id, LEAST(max(at), now()) AS checked_at, max(covers) AS covers
          FROM parsed
         WHERE at IS NOT NULL AND covers IS NOT NULL
         GROUP BY messenger_id
    ),
    covered AS (
        SELECT m.messenger_id, m.checked_at
          FROM merged AS m
         WHERE COALESCE(public.oko_chat_waiting_since(m.messenger_id) >= m.covers, true)
    )
    INSERT INTO public.oko_chat_checks AS c (messenger_id, checked_at)
    SELECT messenger_id, checked_at FROM covered
    ON CONFLICT (messenger_id) DO UPDATE
       SET checked_at = EXCLUDED.checked_at
     WHERE c.checked_at < EXCLUDED.checked_at;

    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_mark_chats_checked(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_mark_chats_checked(jsonb) TO service_role;

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
    checked_at        timestamptz,
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
    page AS (
        SELECT * FROM last_msg
         WHERE direction = 'in'
            OR COALESCE(author_type, '') IN ('robot', 'bot')
            OR sent_at >= now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 14), 365)))
         ORDER BY sent_at DESC
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))
    ),
    sent_out AS (
        -- Ответы, ушедшие из АБХАЗБИЗНЕС через очередь: в переписку они сами
        -- не записываются. Один проход по очереди, а не подзапрос на строку.
        -- Пишет в очередь сейчас только человек из интерфейса; если через неё
        -- пойдут автоответы, их здесь надо будет отсеять.
        SELECT (x.payload ->> 'contact_messenger_id')::bigint AS messenger_id,
               max(x.sent_at) AS sent_at
          FROM public.oko_outbox AS x
         WHERE x.kind = 'message'
           AND x.status = 'sent'
           AND x.sent_at IS NOT NULL
           AND jsonb_typeof(x.payload -> 'contact_messenger_id') = 'number'
           AND (x.payload ->> 'contact_messenger_id') ~ '^[1-9][0-9]{0,17}$'
         GROUP BY 1
    )
    SELECT l.messenger_id,
           l.client_id,
           c.name,
           c.phones,
           COALESCE(c.is_provisional, true) AS is_temporary,
           c.oko_client_ids[1],
           l.integration_id,
           left(COALESCE(l.text, ''), 300),
           l.direction,
           l.author_type,
           l.sent_at,
           w.since AS waiting_since,
           k.checked_at,
           d.id,
           d.stage
      FROM page AS l
      LEFT JOIN public.clients AS c ON c.id = l.client_id
      LEFT JOIN public.oko_chat_checks AS k ON k.messenger_id = l.messenger_id
      LEFT JOIN sent_out AS so ON so.messenger_id = l.messenger_id
      LEFT JOIN LATERAL (
            SELECT min(i.sent_at) AS since
              FROM public.deal_messages AS i
             WHERE i.oko_contact_messenger_id = l.messenger_id
               AND i.direction = 'in'
               AND i.sent_at > COALESCE(GREATEST(
                       -- ответ человека, пришедший из ОКО (сверка) или импортом
                       (SELECT max(o.sent_at)
                          FROM public.deal_messages AS o
                         WHERE o.oko_contact_messenger_id = l.messenger_id
                           AND o.direction <> 'in'
                           AND COALESCE(o.author_type, '') NOT IN ('robot', 'bot')),
                       -- ответ, отправленный из АБХАЗБИЗНЕС через очередь
                       so.sent_at
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
