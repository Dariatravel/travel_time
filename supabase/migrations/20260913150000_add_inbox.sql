-- Экран «Входящие» и склейка переписок с клиентами (12.09.2026).
--
-- Живые сообщения из ОКО приходят с идентификатором переписки. У клиентов,
-- перенесённых из ОКО, этих идентификаторов нет (в выгрузке они были только
-- у сделок на этапе «Бронь»), поэтому:
--   1. загружаем известные связи (функция oko_link_clients_batch);
--   2. неизвестные переписки показываем на экране «Входящие», где менеджер
--      может привязать чат к нужному клиенту руками (oko_merge_clients).
--
-- Экран «Входящие» строится функцией oko_inbox: последнее сообщение каждой
-- переписки, сколько времени клиент ждёт ответа и кто он, если известен.
-- Это же закрывает ежедневную работу Алины: она дважды в день вручную ищет
-- пропущенные и зависшие чаты.
--
-- Откат: DROP FUNCTION public.oko_inbox(int, int), public.oko_link_clients_batch(jsonb),
-- public.oko_merge_clients(uuid, uuid); DROP INDEX public.deal_messages_inbox_idx;
-- папка src/features/Inbox, src/app/main/inbox.
BEGIN;

-- Экран «Входящие» берёт последнее сообщение каждой переписки: нужен порядок
-- (переписка, время) в одном индексе. Строится под блокировкой таблицы, но
-- индекс частичный: идентификатор переписки есть только у живых сообщений
-- (перенесённые из выгрузки привязаны к контакту), их тысячи, а не сотни
-- тысяч, поэтому блокировка — доли секунды.
CREATE INDEX IF NOT EXISTS deal_messages_inbox_idx
    ON public.deal_messages (oko_contact_messenger_id, sent_at DESC)
    WHERE oko_contact_messenger_id IS NOT NULL;

-- Прежний индекс по одному только идентификатору переписки стал префиксом
-- нового — держать оба незачем.
DROP INDEX IF EXISTS public.deal_messages_messenger_idx;

-- Была одиночная версия связки (по запросу на связь) — заменена пачковой.
DROP FUNCTION IF EXISTS public.oko_link_client(bigint, bigint[], bigint[]);

/**
 * Проставить клиентам идентификаторы ОКО пачкой: связей две с половиной
 * тысячи, по отдельному запросу на каждую импорт не уложился бы в 30 секунд,
 * отведённые контейнеру. На вход — массив
 * {oko_contact_id, oko_messenger_ids, oko_client_ids}.
 * Возвращает число клиентов, которым что-то дописали.
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
    IF jsonb_typeof(p_rows) <> 'array' THEN
        RAISE EXCEPTION 'Ожидался массив связей';
    END IF;

    WITH input AS (
        SELECT (r ->> 'oko_contact_id')::bigint AS contact_id,
               CASE WHEN jsonb_typeof(r -> 'oko_messenger_ids') = 'array'
                    THEN r -> 'oko_messenger_ids' ELSE '[]'::jsonb END AS messenger_json,
               CASE WHEN jsonb_typeof(r -> 'oko_client_ids') = 'array'
                    THEN r -> 'oko_client_ids' ELSE '[]'::jsonb END AS client_json
          FROM jsonb_array_elements(p_rows) AS r
         -- Кривая строка не должна ронять всю пачку: берём только те, где
         -- идентификатор контакта — целое число.
         WHERE jsonb_typeof(r -> 'oko_contact_id') = 'number'
           AND (r ->> 'oko_contact_id') ~ '^[0-9]+$'
    ),
    -- Один контакт может встретиться в пачке несколько раз: собираем все его
    -- идентификаторы вместе, иначе UPDATE ... FROM взял бы только одну строку.
    grouped AS (
        SELECT i.contact_id,
               COALESCE(array_agg(DISTINCT m.v) FILTER (WHERE m.v IS NOT NULL), '{}') AS messenger_ids,
               COALESCE(array_agg(DISTINCT c.v) FILTER (WHERE c.v IS NOT NULL), '{}') AS client_ids
          FROM input AS i
          LEFT JOIN LATERAL (
                SELECT t.val::bigint AS v
                  FROM jsonb_array_elements_text(i.messenger_json) AS t(val)
                 WHERE t.val ~ '^[0-9]+$'
          ) AS m ON true
          LEFT JOIN LATERAL (
                SELECT t.val::bigint AS v
                  FROM jsonb_array_elements_text(i.client_json) AS t(val)
                 WHERE t.val ~ '^[0-9]+$'
          ) AS c ON true
         GROUP BY i.contact_id
    ),
    updated AS (
        UPDATE public.clients AS cl
           SET oko_messenger_ids = (
                   SELECT COALESCE(array_agg(DISTINCT x), '{}')
                     FROM unnest(cl.oko_messenger_ids || g.messenger_ids) AS x WHERE x IS NOT NULL),
               oko_client_ids = (
                   SELECT COALESCE(array_agg(DISTINCT x), '{}')
                     FROM unnest(cl.oko_client_ids || g.client_ids) AS x WHERE x IS NOT NULL),
               updated_at = now()
          FROM grouped AS g
         WHERE cl.oko_contact_id = g.contact_id
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_updated FROM updated;

    RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_link_clients_batch(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_link_clients_batch(jsonb) TO service_role;

/**
 * Склеить временную карточку (заведённую по живому сообщению из ОКО) с
 * настоящим клиентом: сообщения, сделки и очередь отправки переезжают,
 * идентификаторы ОКО и контакты дописываются, временная карточка удаляется.
 *
 * Сливать можно ТОЛЬКО временную карточку (у неё нет oko_contact_id): иначе
 * одно неверное нажатие удалило бы настоящего клиента вместе с историей.
 * Доступ пока только у Дарьи (admin) — как и весь остальной модуль CRM;
 * менеджерам откроем вместе с политиками доступа отдельным шагом.
 *
 * Возвращает число перенесённых сообщений.
 */
DROP FUNCTION IF EXISTS public.oko_merge_clients(uuid, uuid);
CREATE FUNCTION public.oko_merge_clients(p_from uuid, p_into uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_moved integer;
BEGIN
    IF public.current_app_role() <> 'admin' THEN
        RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
    END IF;
    IF p_from IS NULL OR p_into IS NULL OR p_from = p_into THEN
        RAISE EXCEPTION 'Нужны две разные карточки';
    END IF;

    -- Блокируем обе карточки в одном порядке (по идентификатору): иначе два
    -- одновременных слияния A→B и B→A встанут намертво.
    PERFORM 1 FROM public.clients WHERE id IN (p_from, p_into) ORDER BY id FOR UPDATE;

    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_from AND oko_contact_id IS NULL) THEN
        RAISE EXCEPTION 'Переносить можно только временную карточку из переписки';
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
           -- Телефон, почта и имя временной карточки не должны пропасть.
           phones = (SELECT COALESCE(array_agg(DISTINCT x), '{}')
                       FROM unnest(target.phones || source.phones) AS x WHERE btrim(x) <> ''),
           emails = (SELECT COALESCE(array_agg(DISTINCT x), '{}')
                       FROM unnest(target.emails || source.emails) AS x WHERE btrim(x) <> ''),
           name = COALESCE(NULLIF(btrim(target.name), ''), source.name),
           telegram_user_id = COALESCE(target.telegram_user_id, source.telegram_user_id),
           note = CASE
               WHEN COALESCE(btrim(source.note), '') = '' THEN target.note
               WHEN COALESCE(btrim(target.note), '') = '' THEN source.note
               ELSE target.note || E'\n' || source.note
           END,
           last_incoming_at = GREATEST(target.last_incoming_at, source.last_incoming_at),
           updated_at = now()
      FROM public.clients AS source
     WHERE target.id = p_into AND source.id = p_from;

    -- Порядок важен: у deal_messages.client_id стоит ON DELETE CASCADE,
    -- переписка должна переехать ДО удаления карточки.
    UPDATE public.deal_messages SET client_id = p_into WHERE client_id = p_from;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    UPDATE public.deals      SET client_id = p_into WHERE client_id = p_from;
    UPDATE public.oko_outbox SET client_id = p_into WHERE client_id = p_from;

    DELETE FROM public.clients WHERE id = p_from;

    RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_merge_clients(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oko_merge_clients(uuid, uuid) TO authenticated;

/**
 * Привязать переписку к уже существующему клиенту, ничего не удаляя:
 * идентификатор чата дописывается клиенту, сообщения переезжают на него.
 * Нужен для чатов, у которых временной карточки нет вовсе.
 */
CREATE OR REPLACE FUNCTION public.oko_attach_chat(p_messenger_id bigint, p_client uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_moved integer;
BEGIN
    IF public.current_app_role() <> 'admin' THEN
        RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
    END IF;
    IF p_messenger_id IS NULL OR p_client IS NULL THEN
        RAISE EXCEPTION 'Нужны переписка и клиент';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client) THEN
        RAISE EXCEPTION 'Клиент не найден';
    END IF;

    UPDATE public.clients AS c
       SET oko_messenger_ids = (
               SELECT COALESCE(array_agg(DISTINCT x), '{}')
                 FROM unnest(c.oko_messenger_ids || ARRAY[p_messenger_id]) AS x),
           updated_at = now()
     WHERE c.id = p_client;

    UPDATE public.deal_messages
       SET client_id = p_client
     WHERE oko_contact_messenger_id = p_messenger_id
       AND client_id IS DISTINCT FROM p_client;
    GET DIAGNOSTICS v_moved = ROW_COUNT;

    RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_attach_chat(bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oko_attach_chat(bigint, uuid) TO authenticated;

/**
 * Экран «Входящие»: по одной строке на переписку, самое свежее сообщение
 * сверху.
 *
 * «Ждёт ответа» считается от ПЕРВОГО сообщения клиента, оставшегося без
 * ответа, а не от последнего: клиент, написавший пять раз за четыре часа,
 * ждёт четыре часа, а не десять минут.
 *
 * Окно p_days отсекает только те переписки, где последним говорили мы.
 * Неотвеченные показываем независимо от возраста — иначе самые запущенные
 * случаи, ради которых экран и делается, с него бы и пропали.
 */
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
               m.sent_at
          FROM public.deal_messages AS m
         WHERE m.oko_contact_messenger_id IS NOT NULL
         ORDER BY m.oko_contact_messenger_id, m.sent_at DESC
    ),
    page AS (
        SELECT * FROM last_msg
         WHERE direction = 'in'
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
           l.sent_at,
           CASE WHEN l.direction = 'in' THEN w.since END AS waiting_since,
           d.id,
           d.stage
      FROM page AS l
      LEFT JOIN public.clients AS c ON c.id = l.client_id
      -- Первое сообщение клиента после нашего последнего ответа.
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
