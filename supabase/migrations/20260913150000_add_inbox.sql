-- Экран «Входящие» и склейка переписок с клиентами (12.09.2026).
--
-- Живые сообщения из ОКО приходят с идентификатором переписки. У клиентов,
-- перенесённых из ОКО, этих идентификаторов нет (в выгрузке они были только
-- у сделок на этапе «Бронь»), поэтому:
--   1. загружаем известные связи (функция oko_link_client);
--   2. неизвестные переписки показываем на экране «Входящие», где менеджер
--      может привязать чат к нужному клиенту руками (oko_merge_clients).
--
-- Экран «Входящие» строится функцией oko_inbox: последнее сообщение каждой
-- переписки, сколько времени клиент ждёт ответа и кто он, если известен.
-- Это же закрывает ежедневную работу Алины: она дважды в день вручную ищет
-- пропущенные и зависшие чаты.
--
-- Откат: DROP FUNCTION public.oko_inbox(int, int), public.oko_link_client(bigint, bigint[], bigint[]),
-- public.oko_merge_clients(uuid, uuid); папка src/features/Inbox, src/app/main/inbox.
BEGIN;

/** Проставить клиенту идентификаторы ОКО (загрузка карты связей из выгрузки). */
CREATE OR REPLACE FUNCTION public.oko_link_client(
    p_contact_id    bigint,
    p_messenger_ids bigint[],
    p_client_ids    bigint[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated integer;
BEGIN
    UPDATE public.clients AS c
       SET oko_messenger_ids = (
               SELECT COALESCE(array_agg(DISTINCT x), '{}')
                 FROM unnest(c.oko_messenger_ids || COALESCE(p_messenger_ids, '{}')) AS x),
           oko_client_ids = (
               SELECT COALESCE(array_agg(DISTINCT x), '{}')
                 FROM unnest(c.oko_client_ids || COALESCE(p_client_ids, '{}')) AS x),
           updated_at = now()
     WHERE c.oko_contact_id = p_contact_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_link_client(bigint, bigint[], bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_link_client(bigint, bigint[], bigint[]) TO service_role;

/**
 * Склеить временного клиента (заведённого по живому сообщению) с настоящим:
 * сообщения и сделки переезжают, идентификаторы ОКО добавляются, временная
 * карточка удаляется. Только для admin/operator — это ручное действие
 * менеджера на экране «Входящие».
 */
CREATE OR REPLACE FUNCTION public.oko_merge_clients(p_from uuid, p_into uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF public.current_app_role() NOT IN ('admin', 'operator') THEN
        RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
    END IF;
    IF p_from = p_into OR p_from IS NULL OR p_into IS NULL THEN
        RAISE EXCEPTION 'Нужны два разных клиента';
    END IF;

    UPDATE public.clients AS target
       SET oko_messenger_ids = (
               SELECT COALESCE(array_agg(DISTINCT x), '{}')
                 FROM unnest(target.oko_messenger_ids || source.oko_messenger_ids) AS x),
           oko_client_ids = (
               SELECT COALESCE(array_agg(DISTINCT x), '{}')
                 FROM unnest(target.oko_client_ids || source.oko_client_ids) AS x),
           last_incoming_at = GREATEST(
               COALESCE(target.last_incoming_at, source.last_incoming_at),
               COALESCE(source.last_incoming_at, target.last_incoming_at)),
           updated_at = now()
      FROM public.clients AS source
     WHERE target.id = p_into AND source.id = p_from;

    UPDATE public.deal_messages SET client_id = p_into WHERE client_id = p_from;
    UPDATE public.deals         SET client_id = p_into WHERE client_id = p_from;
    UPDATE public.oko_outbox    SET client_id = p_into WHERE client_id = p_from;
    DELETE FROM public.clients WHERE id = p_from;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_merge_clients(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oko_merge_clients(uuid, uuid) TO authenticated;

/**
 * Экран «Входящие»: по одной строке на переписку, самое свежее сообщение
 * сверху. Показывает, сколько клиент ждёт ответа: если последним писал он —
 * время с его сообщения, если ответили — ничего не ждёт.
 */
CREATE OR REPLACE FUNCTION public.oko_inbox(p_days integer DEFAULT 14, p_limit integer DEFAULT 200)
RETURNS TABLE (
    messenger_id      bigint,
    client_id         uuid,
    client_name       text,
    client_phones     text[],
    is_temporary      boolean,
    integration_id    integer,
    last_text         text,
    last_direction    text,
    last_at           timestamptz,
    waiting_since     timestamptz,
    messages_count    bigint,
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
               m.sent_at
          FROM public.deal_messages AS m
         WHERE m.oko_contact_messenger_id IS NOT NULL
           AND m.sent_at >= now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 14), 120)))
         ORDER BY m.oko_contact_messenger_id, m.sent_at DESC
    ),
    counted AS (
        SELECT m.oko_contact_messenger_id AS messenger_id, count(*) AS messages_count
          FROM public.deal_messages AS m
         WHERE m.oko_contact_messenger_id IS NOT NULL
         GROUP BY m.oko_contact_messenger_id
    )
    SELECT l.messenger_id,
           l.client_id,
           c.name,
           c.phones,
           COALESCE(c.oko_contact_id IS NULL, true) AS is_temporary,
           l.integration_id,
           left(COALESCE(l.text, ''), 300),
           l.direction,
           l.sent_at,
           CASE WHEN l.direction = 'in' THEN l.sent_at END AS waiting_since,
           COALESCE(n.messages_count, 0),
           d.id,
           d.stage
      FROM last_msg AS l
      LEFT JOIN public.clients AS c ON c.id = l.client_id
      LEFT JOIN counted AS n ON n.messenger_id = l.messenger_id
      LEFT JOIN LATERAL (
            SELECT dl.id, dl.stage
              FROM public.deals AS dl
             WHERE dl.client_id = l.client_id
             ORDER BY dl.updated_at DESC
             LIMIT 1
      ) AS d ON true
     ORDER BY l.sent_at DESC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))
$$;

REVOKE ALL ON FUNCTION public.oko_inbox(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oko_inbox(integer, integer) TO authenticated;

COMMIT;
