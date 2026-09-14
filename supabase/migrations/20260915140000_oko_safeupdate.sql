-- Функции сверки и связки клиентов под pg-safeupdate (14.09.2026).
--
-- В рабочей базе Supabase у роли authenticator (через неё ходит PostgREST,
-- то есть и серверный клиент приложения) включён safeupdate: DELETE и
-- UPDATE без WHERE отклоняются — даже внутри SECURITY DEFINER функций.
-- Прямой вызов под postgres при этом работает, поэтому ошибка не видна
-- ни в проверке на чистом Postgres, ни при ручной проверке.
--
-- Так 14.09 молча не работала выдача «ждущих» чатов для сверки
-- (oko_waiting_contacts_to_check: очистка временной таблицы без WHERE) —
-- сверка получала только старый круг. Та же ловушка была в
-- oko_link_clients_batch (загрузка связей при импорте из ОКО).
--
-- Здесь те же функции, отличие одно: очистка временной таблицы с WHERE true.
-- Чтобы ловушка не вернулась, scripts/checks/reliability.sql проверяет, что
-- ни в одной функции public нет DELETE/UPDATE без WHERE.
--
-- Откат: применить функции заново из 20260915130000_oko_waiting_targets.sql
-- и 20260914090000_reliability_db.sql (вернёт ошибку).
BEGIN;

CREATE OR REPLACE FUNCTION public.oko_waiting_contacts_to_check(p_limit integer DEFAULT 2)
RETURNS TABLE (oko_contact_id bigint, waiting_since timestamptz, unchecked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Ручной запуск во время расписания не должен получить тех же.
    PERFORM pg_advisory_xact_lock(hashtext('oko_waiting_contacts_to_check'));

    CREATE TEMP TABLE IF NOT EXISTS pg_temp._oko_need (
        contact_id  bigint PRIMARY KEY,
        since       timestamptz,
        not_checked boolean
    ) ON COMMIT DROP;
    -- WHERE true обязателен: safeupdate отклоняет DELETE без WHERE.
    DELETE FROM pg_temp._oko_need WHERE true;

    -- oko_inbox(1, 500): ждущие чаты попадают в страницу при любой давности,
    -- короткое окно лишь не пускает туда отвеченные.
    INSERT INTO pg_temp._oko_need (contact_id, since, not_checked)
    SELECT ch.contact_id,
           CASE WHEN bool_or(ch.not_checked) THEN max(ch.since) ELSE min(ch.since) END,
           bool_or(ch.not_checked)
      FROM (
            SELECT i.waiting_since AS since,
                   (i.checked_at IS NULL OR i.checked_at < i.last_at) AS not_checked,
                   COALESCE(cc.oko_contact_id, c.oko_contact_id) AS contact_id
              FROM public.oko_inbox(1, 500) AS i
              LEFT JOIN public.clients AS c ON c.id = i.client_id
              LEFT JOIN public.oko_chat_contacts AS cc ON cc.messenger_id = i.messenger_id
             WHERE i.waiting_since IS NOT NULL
               AND i.waiting_since >= now() - interval '14 days'
               AND i.waiting_since <  now() - interval '20 minutes'
               AND (i.checked_at IS NULL
                    OR i.checked_at < i.last_at
                    OR (i.checked_at < now() - interval '40 minutes'
                        AND i.waiting_since >= now() - interval '2 days'))
           ) AS ch
     WHERE ch.contact_id IS NOT NULL
     GROUP BY ch.contact_id;

    -- Кому сверка больше не нужна — счётчик неудач сбрасывается.
    DELETE FROM public.oko_contact_checks AS k
     WHERE NOT EXISTS (SELECT 1 FROM pg_temp._oko_need AS n WHERE n.contact_id = k.oko_contact_id);

    RETURN QUERY
    WITH picked AS (
        SELECT n.contact_id, n.since, n.not_checked
          FROM pg_temp._oko_need AS n
          LEFT JOIN public.oko_contact_checks AS k ON k.oko_contact_id = n.contact_id
         WHERE k.attempted_at IS NULL
            -- Степень ограничена: LEAST считает оба аргумента, и 20 минут
            -- на 2^33 переполняли interval — падала вся выдача.
            OR k.attempted_at < now() - LEAST(
                   interval '4 hours',
                   interval '20 minutes' * power(2, LEAST(GREATEST(k.attempts - 1, 0), 4)))
         ORDER BY n.not_checked DESC,
                  CASE WHEN n.not_checked THEN n.since END DESC,
                  CASE WHEN NOT n.not_checked THEN n.since END ASC
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 2), 20))
    ),
    stamped AS (
        INSERT INTO public.oko_contact_checks AS k (oko_contact_id, attempted_at, attempts)
        SELECT pk.contact_id, now(), 1 FROM picked AS pk
        ON CONFLICT ON CONSTRAINT oko_contact_checks_pkey DO UPDATE
           SET attempted_at = EXCLUDED.attempted_at,
               attempts = LEAST(k.attempts + 1, 1000)
        RETURNING k.oko_contact_id
    )
    SELECT pk.contact_id, pk.since, pk.not_checked
      FROM picked AS pk
      JOIN stamped AS s ON s.oko_contact_id = pk.contact_id
     ORDER BY pk.not_checked DESC,
              CASE WHEN pk.not_checked THEN pk.since END DESC,
              CASE WHEN NOT pk.not_checked THEN pk.since END ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_waiting_contacts_to_check(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_waiting_contacts_to_check(integer) TO service_role;

/** Загрузка связей из выгрузки — заодно заполняет таблицу привязок. */
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

    CREATE TEMP TABLE IF NOT EXISTS _links (contact_id bigint, kind text, external_id bigint) ON COMMIT DROP;
    -- WHERE true обязателен: safeupdate отклоняет DELETE без WHERE.
    DELETE FROM _links WHERE true;

    INSERT INTO _links (contact_id, kind, external_id)
    SELECT (r ->> 'oko_contact_id')::bigint, 'messenger', t.val::bigint
      FROM jsonb_array_elements(p_rows) AS r
      CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(r -> 'oko_messenger_ids') = 'array'
                 THEN r -> 'oko_messenger_ids' ELSE '[]'::jsonb END) AS t(val)
     -- Кривая строка не должна ронять всю пачку: «1.5» — тоже number,
     -- но в bigint не превратится.
     WHERE jsonb_typeof(r -> 'oko_contact_id') = 'number'
       AND (r ->> 'oko_contact_id') ~ '^[0-9]+$'
       AND t.val ~ '^[0-9]+$';

    INSERT INTO _links (contact_id, kind, external_id)
    SELECT (r ->> 'oko_contact_id')::bigint, 'client', t.val::bigint
      FROM jsonb_array_elements(p_rows) AS r
      CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(r -> 'oko_client_ids') = 'array'
                 THEN r -> 'oko_client_ids' ELSE '[]'::jsonb END) AS t(val)
     -- Кривая строка не должна ронять всю пачку: «1.5» — тоже number,
     -- но в bigint не превратится.
     WHERE jsonb_typeof(r -> 'oko_contact_id') = 'number'
       AND (r ->> 'oko_contact_id') ~ '^[0-9]+$'
       AND t.val ~ '^[0-9]+$';

    -- Привязки: настоящий клиент забирает идентификатор у временной карточки.
    --
    -- DISTINCT ON обязателен: один идентификатор клиента ОКО бывает сразу у
    -- нескольких контактов, и тогда в одну команду попали бы две строки с
    -- одним ключом — Postgres откажет («cannot affect row a second time»)
    -- и уронит всю пачку. Берём одного владельца: настоящего клиента,
    -- при равенстве — с меньшим номером контакта, чтобы выбор был
    -- повторяемым, а не случайным.
    INSERT INTO public.client_external_ids (provider, kind, external_id, client_id)
    SELECT DISTINCT ON (l.kind, l.external_id) 'oko', l.kind, l.external_id, c.id
      FROM _links AS l
      JOIN public.clients AS c ON c.oko_contact_id = l.contact_id
     ORDER BY l.kind, l.external_id, c.is_provisional, c.oko_contact_id
    ON CONFLICT (provider, kind, external_id) DO UPDATE
        SET client_id = EXCLUDED.client_id
      WHERE (SELECT cl.is_provisional FROM public.clients AS cl
              WHERE cl.id = public.client_external_ids.client_id);

    WITH updated AS (
        UPDATE public.clients AS c
           SET oko_messenger_ids = (
                   SELECT COALESCE(array_agg(DISTINCT x), '{}') FROM unnest(
                       c.oko_messenger_ids || COALESCE((
                           SELECT array_agg(e.external_id) FROM public.client_external_ids AS e
                            WHERE e.client_id = c.id AND e.provider = 'oko' AND e.kind = 'messenger'), '{}')
                   ) AS x),
               oko_client_ids = (
                   SELECT COALESCE(array_agg(DISTINCT x), '{}') FROM unnest(
                       c.oko_client_ids || COALESCE((
                           SELECT array_agg(e.external_id) FROM public.client_external_ids AS e
                            WHERE e.client_id = c.id AND e.provider = 'oko' AND e.kind = 'client'), '{}')
                   ) AS x),
               updated_at = now()
         WHERE c.oko_contact_id IN (SELECT DISTINCT contact_id FROM _links)
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_updated FROM updated;

    RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_link_clients_batch(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_link_clients_batch(jsonb) TO service_role;

COMMIT;
