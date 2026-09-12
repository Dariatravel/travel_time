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

-- Экран «Входящие» берёт последнее сообщение каждой переписки: нужен порядок
-- (переписка, время) в одном индексе, иначе на 200 тысячах строк это перебор.
CREATE INDEX IF NOT EXISTS deal_messages_inbox_idx
    ON public.deal_messages (oko_contact_messenger_id, sent_at DESC)
    WHERE oko_contact_messenger_id IS NOT NULL;

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
 * То же пачкой: связей две с половиной тысячи, по одному запросу на каждую
 * импорт бы не уложился в 30 секунд, отведённые контейнеру.
 * На вход — массив {oko_contact_id, oko_messenger_ids, oko_client_ids}.
 */
CREATE OR REPLACE FUNCTION public.oko_link_clients_batch(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated integer;
BEGIN
    WITH input AS (
        SELECT (r ->> 'oko_contact_id')::bigint AS contact_id,
               COALESCE((SELECT array_agg(x::bigint) FROM jsonb_array_elements_text(r -> 'oko_messenger_ids') AS x), '{}') AS messenger_ids,
               COALESCE((SELECT array_agg(x::bigint) FROM jsonb_array_elements_text(r -> 'oko_client_ids') AS x), '{}') AS client_ids
          FROM jsonb_array_elements(p_rows) AS r
         WHERE (r ->> 'oko_contact_id') IS NOT NULL
    ),
    updated AS (
        UPDATE public.clients AS c
           SET oko_messenger_ids = (
                   SELECT COALESCE(array_agg(DISTINCT x), '{}')
                     FROM unnest(c.oko_messenger_ids || i.messenger_ids) AS x WHERE x IS NOT NULL),
               oko_client_ids = (
                   SELECT COALESCE(array_agg(DISTINCT x), '{}')
                     FROM unnest(c.oko_client_ids || i.client_ids) AS x WHERE x IS NOT NULL),
               updated_at = now()
          FROM input AS i
         WHERE c.oko_contact_id = i.contact_id
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_updated FROM updated;

    RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_link_clients_batch(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_link_clients_batch(jsonb) TO service_role;

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
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_from) THEN
        RAISE EXCEPTION 'Карточка, которую переносим, не найдена';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_into) THEN
        RAISE EXCEPTION 'Клиент, к которому привязываем, не найден';
    END IF;

    UPDATE public.clients AS target
       SET oko_messenger_ids = (
               SELECT COALESCE(array_agg(DISTINCT x), '{}')
                 FROM unnest(target.oko_messenger_ids || source.oko_messenger_ids) AS x),
           oko_client_ids = (
               SELECT COALESCE(array_agg(DISTINCT x), '{}')
                 FROM unnest(target.oko_client_ids || source.oko_client_ids) AS x),
           -- Телефон и почта временной карточки не должны пропасть при склейке.
           phones = (SELECT COALESCE(array_agg(DISTINCT x), '{}')
                       FROM unnest(target.phones || source.phones) AS x WHERE x <> ''),
           emails = (SELECT COALESCE(array_agg(DISTINCT x), '{}')
                       FROM unnest(target.emails || source.emails) AS x WHERE x <> ''),
           name = COALESCE(NULLIF(btrim(target.name), ''), source.name),
           telegram_user_id = COALESCE(target.telegram_user_id, source.telegram_user_id),
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
    -- Сначала отбираем те переписки, что попадут на экран, и только для них
    -- считаем сообщения: пересчёт всей таблицы (200 тысяч строк) на каждое
    -- открытие «Входящих» не нужен.
    page AS (
        SELECT * FROM last_msg ORDER BY sent_at DESC
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))
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
      FROM page AS l
      LEFT JOIN public.clients AS c ON c.id = l.client_id
      LEFT JOIN LATERAL (
            SELECT count(*) AS messages_count
              FROM public.deal_messages AS m
             WHERE m.oko_contact_messenger_id = l.messenger_id
      ) AS n ON true
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
