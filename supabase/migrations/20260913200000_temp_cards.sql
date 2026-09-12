-- Разбор временных карточек (12.09.2026).
--
-- Живые сообщения из ОКО, пришедшие ДО загрузки связей «контакт → переписки»,
-- завели временные карточки клиентов. Теперь связи есть, и для большинства
-- таких карточек настоящий клиент находится по совпадению идентификатора
-- переписки или клиента ОКО. Здесь:
--   oko_temp_card_matches  — отчёт: какая временная карточка к какому клиенту
--                            сводится, сколько кандидатов, совпадает ли телефон;
--   oko_merge_temp_cards   — сведение всех однозначных пар (ровно один кандидат).
-- Обе функции доступны только сервисной роли: их зовёт серверный маршрут
-- после проверки, что запрос от администратора. Сначала всегда сухой прогон.
--
-- Откат: DROP FUNCTION public.oko_temp_card_matches(), public.oko_merge_temp_cards(),
-- public.oko_merge_clients_unchecked(uuid, uuid); вернуть oko_merge_clients из
-- 20260913150000_add_inbox.sql.
BEGIN;

/** Тело сведения без проверки роли — для ручного и пакетного вызова. */
CREATE OR REPLACE FUNCTION public.oko_merge_clients_unchecked(p_from uuid, p_into uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_moved integer;
BEGIN
    IF p_from IS NULL OR p_into IS NULL OR p_from = p_into THEN
        RAISE EXCEPTION 'Нужны две разные карточки';
    END IF;

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

    UPDATE public.deal_messages SET client_id = p_into WHERE client_id = p_from;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    UPDATE public.deals      SET client_id = p_into WHERE client_id = p_from;
    UPDATE public.oko_outbox SET client_id = p_into WHERE client_id = p_from;

    DELETE FROM public.clients WHERE id = p_from;

    RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_merge_clients_unchecked(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_merge_clients_unchecked(uuid, uuid) TO service_role;

/** Ручное сведение с экрана «Входящие»: проверка роли + общее тело. */
CREATE OR REPLACE FUNCTION public.oko_merge_clients(p_from uuid, p_into uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF public.current_app_role() <> 'admin' THEN
        RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
    END IF;

    RETURN public.oko_merge_clients_unchecked(p_from, p_into);
END;
$$;

/**
 * Отчёт по временным карточкам. Кандидат — настоящий клиент (с oko_contact_id),
 * у которого совпал идентификатор переписки или клиента ОКО. Сводить можно
 * только при ровно одном кандидате; при нескольких — разбирать руками.
 */
CREATE OR REPLACE FUNCTION public.oko_temp_card_matches()
RETURNS TABLE (
    temp_id          uuid,
    temp_name        text,
    temp_messages    bigint,
    real_id          uuid,
    real_name        text,
    real_contact_id  bigint,
    candidates       integer,
    phone_match      boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH temp AS (
        SELECT t.id, t.name, t.phones, t.oko_messenger_ids, t.oko_client_ids
          FROM public.clients AS t
         WHERE t.oko_contact_id IS NULL
           AND (cardinality(t.oko_messenger_ids) > 0 OR cardinality(t.oko_client_ids) > 0)
    ),
    pairs AS (
        SELECT t.id AS temp_id,
               r.id AS real_id,
               r.name AS real_name,
               r.oko_contact_id,
               (t.phones && r.phones) AS phone_match
          FROM temp AS t
          JOIN public.clients AS r
            ON r.oko_contact_id IS NOT NULL
           AND (r.oko_messenger_ids && t.oko_messenger_ids
                OR r.oko_client_ids && t.oko_client_ids)
    ),
    counted AS (
        SELECT p.temp_id, count(*)::integer AS n FROM pairs AS p GROUP BY p.temp_id
    )
    SELECT t.id,
           t.name,
           (SELECT count(*) FROM public.deal_messages AS m WHERE m.client_id = t.id),
           p.real_id,
           p.real_name,
           p.oko_contact_id,
           COALESCE(c.n, 0),
           p.phone_match
      FROM temp AS t
      LEFT JOIN counted AS c ON c.temp_id = t.id
      LEFT JOIN pairs AS p ON p.temp_id = t.id AND c.n = 1
     ORDER BY COALESCE(c.n, 0) DESC, t.name NULLS LAST
$$;

REVOKE ALL ON FUNCTION public.oko_temp_card_matches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_temp_card_matches() TO service_role;

/** Свести все однозначные пары. Возвращает число сведённых карточек. */
CREATE OR REPLACE FUNCTION public.oko_merge_temp_cards()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    rec    record;
    v_done integer := 0;
BEGIN
    -- Пары фиксируем до начала: сведение меняет таблицу, по которой считался отчёт.
    FOR rec IN
        SELECT m.temp_id, m.real_id
          FROM public.oko_temp_card_matches() AS m
         WHERE m.candidates = 1 AND m.real_id IS NOT NULL
    LOOP
        PERFORM public.oko_merge_clients_unchecked(rec.temp_id, rec.real_id);
        v_done := v_done + 1;
    END LOOP;

    RETURN v_done;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_merge_temp_cards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_merge_temp_cards() TO service_role;

COMMIT;
