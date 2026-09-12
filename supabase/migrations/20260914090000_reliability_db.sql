-- Надёжность базы: деньги, временные карточки, уникальные привязки (14.09.2026).
--
-- Три находки внешнего ревью, подтверждённые по коду:
--
-- 1. Удаление отеля физически стирало выплаты и корректировки (каскад),
--    несмотря на «мягкое удаление» в интерфейсе. Деньги теперь нельзя
--    удалить ни каскадом, ни напрямую — только пометить удалённой.
-- 2. «Нет номера контакта ОКО» — не то же самое, что «временная карточка».
--    Клиент, заведённый прямо в нашей программе, тоже без этого номера,
--    и сведение могло его удалить. Появился явный признак is_provisional.
-- 3. Заведение клиента по живому сообщению работало как «сначала посмотрел,
--    потом вставил»: два одновременных первых сообщения могли дать двух
--    клиентов, а идентификатор переписки мог оказаться у двоих сразу.
--    Появилась таблица привязок с уникальным ключом; выбор клиента —
--    атомарный INSERT ... ON CONFLICT.
--
-- Массивы clients.oko_messenger_ids / oko_client_ids остаются и заполняются
-- по-прежнему: на них опираются экран «Входящие» и загрузка связей. Таблица
-- привязок — источник истины, массивы синхронизируются триггером.
--
-- Откат: DROP TABLE public.client_external_ids; ALTER TABLE public.clients
-- DROP COLUMN is_provisional; вернуть внешние ключи и функции из
-- 20260912150000_add_finance.sql, 20260913120000_add_oko_live.sql,
-- 20260913200000_temp_cards.sql.
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Деньги не удаляются
-- ─────────────────────────────────────────────────────────────────────────

-- Каскад от отеля стирал историю расчётов. Теперь отель с выплатами или
-- корректировками удалить нельзя — его нужно сначала разобрать руками.
ALTER TABLE public.hotel_payouts
    DROP CONSTRAINT IF EXISTS hotel_payouts_hotel_id_fkey,
    ADD  CONSTRAINT hotel_payouts_hotel_id_fkey
         FOREIGN KEY (hotel_id) REFERENCES public.hotels (id) ON DELETE RESTRICT;

ALTER TABLE public.finance_adjustments
    DROP CONSTRAINT IF EXISTS finance_adjustments_hotel_id_fkey,
    ADD  CONSTRAINT finance_adjustments_hotel_id_fkey
         FOREIGN KEY (hotel_id) REFERENCES public.hotels (id) ON DELETE RESTRICT;

/**
 * Запрет физического удаления денежных записей. Ошиблись — пометьте
 * удалённой (deleted_at), запись остаётся в истории с автором и причиной.
 */
CREATE OR REPLACE FUNCTION public.finance_no_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Денежные записи не удаляются. Пометьте запись удалённой — история должна остаться.'
        USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS hotel_payouts_no_delete ON public.hotel_payouts;
CREATE TRIGGER hotel_payouts_no_delete
    BEFORE DELETE ON public.hotel_payouts
    FOR EACH ROW EXECUTE FUNCTION public.finance_no_hard_delete();

DROP TRIGGER IF EXISTS finance_adjustments_no_delete ON public.finance_adjustments;
CREATE TRIGGER finance_adjustments_no_delete
    BEFORE DELETE ON public.finance_adjustments
    FOR EACH ROW EXECUTE FUNCTION public.finance_no_hard_delete();

-- Проведённую выплату нельзя переписать задним числом: сумму, отель и дату
-- менять нельзя, можно только пометить удалённой и завести новую.
CREATE OR REPLACE FUNCTION public.finance_immutable_amounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.hotel_id IS DISTINCT FROM OLD.hotel_id
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Сумму, отель и время записи менять нельзя. Пометьте запись удалённой и заведите новую.'
            USING ERRCODE = '42501';
    END IF;
    -- Снять пометку удаления можно: это исправление ошибочного удаления.
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hotel_payouts_immutable ON public.hotel_payouts;
CREATE TRIGGER hotel_payouts_immutable
    BEFORE UPDATE ON public.hotel_payouts
    FOR EACH ROW EXECUTE FUNCTION public.finance_immutable_amounts();

DROP TRIGGER IF EXISTS finance_adjustments_immutable ON public.finance_adjustments;
CREATE TRIGGER finance_adjustments_immutable
    BEFORE UPDATE ON public.finance_adjustments
    FOR EACH ROW EXECUTE FUNCTION public.finance_immutable_amounts();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Явный признак временной карточки
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS is_provisional boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS clients_provisional_idx
    ON public.clients (created_at DESC) WHERE is_provisional;

-- Карточки, заведённые живыми сообщениями до появления признака.
UPDATE public.clients
   SET is_provisional = true
 WHERE oko_contact_id IS NULL
   AND note = 'Заведён по живому сообщению из ОКО'
   AND is_provisional = false;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Уникальная привязка переписок
-- ─────────────────────────────────────────────────────────────────────────

/**
 * Внешние идентификаторы клиента. Ключ (поставщик, вид, значение) —
 * уникальный: одна переписка не может принадлежать двум клиентам,
 * а два одновременных первых сообщения не заведут двух клиентов.
 * kind: messenger — идентификатор переписки, client — номер клиента в ОКО.
 */
CREATE TABLE IF NOT EXISTS public.client_external_ids (
    provider    text        NOT NULL DEFAULT 'oko',
    kind        text        NOT NULL CHECK (kind IN ('messenger', 'client')),
    external_id bigint      NOT NULL,
    client_id   uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, kind, external_id)
);

CREATE INDEX IF NOT EXISTS client_external_ids_client_idx
    ON public.client_external_ids (client_id);

ALTER TABLE public.client_external_ids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_external_ids_admin_all ON public.client_external_ids;
CREATE POLICY client_external_ids_admin_all ON public.client_external_ids FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- Заполняем из уже имеющихся массивов. Если один идентификатор оказался
-- у двух клиентов, побеждает настоящий (с номером контакта ОКО), а спорные
-- случаи видно запросом ниже — они останутся без привязки и разберутся руками.
INSERT INTO public.client_external_ids (provider, kind, external_id, client_id)
SELECT 'oko', 'messenger', x.id, x.client_id
  FROM (
      SELECT DISTINCT ON (m) unnest(c.oko_messenger_ids) AS id, c.id AS client_id, unnest(c.oko_messenger_ids) AS m
        FROM public.clients AS c
       ORDER BY m, c.oko_contact_id NULLS LAST, c.created_at
  ) AS x
ON CONFLICT DO NOTHING;

INSERT INTO public.client_external_ids (provider, kind, external_id, client_id)
SELECT 'oko', 'client', x.id, x.client_id
  FROM (
      SELECT DISTINCT ON (m) unnest(c.oko_client_ids) AS id, c.id AS client_id, unnest(c.oko_client_ids) AS m
        FROM public.clients AS c
       ORDER BY m, c.oko_contact_id NULLS LAST, c.created_at
  ) AS x
ON CONFLICT DO NOTHING;

/**
 * Найти или завести клиента по идентификаторам ОКО — атомарно.
 *
 * Порядок: сначала ищем по таблице привязок; не нашли — заводим карточку
 * и пытаемся занять привязку. Если её в этот момент занял другой запрос,
 * свою карточку удаляем и берём чужого клиента: дубля не будет.
 */
CREATE OR REPLACE FUNCTION public.oko_find_or_create_client(
    p_messenger_id bigint,
    p_client_id    bigint,
    p_name         text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id    uuid;
    v_owner uuid;
BEGIN
    IF p_messenger_id IS NULL AND p_client_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT e.client_id INTO v_id
      FROM public.client_external_ids AS e
     WHERE e.provider = 'oko'
       AND ((p_messenger_id IS NOT NULL AND e.kind = 'messenger' AND e.external_id = p_messenger_id)
         OR (p_client_id    IS NOT NULL AND e.kind = 'client'    AND e.external_id = p_client_id))
     ORDER BY (e.kind = 'messenger') DESC
     LIMIT 1;

    IF v_id IS NULL THEN
        INSERT INTO public.clients (name, note, is_provisional)
        VALUES (
            COALESCE(NULLIF(btrim(p_name), ''), 'Клиент из ОКО'),
            'Заведён по живому сообщению из ОКО',
            true
        )
        RETURNING id INTO v_id;

        -- Занимаем привязку. Занята — значит другой запрос успел раньше.
        IF p_messenger_id IS NOT NULL THEN
            INSERT INTO public.client_external_ids (provider, kind, external_id, client_id)
            VALUES ('oko', 'messenger', p_messenger_id, v_id)
            ON CONFLICT (provider, kind, external_id) DO NOTHING;

            SELECT e.client_id INTO v_owner
              FROM public.client_external_ids AS e
             WHERE e.provider = 'oko' AND e.kind = 'messenger' AND e.external_id = p_messenger_id;

            IF v_owner IS DISTINCT FROM v_id THEN
                DELETE FROM public.clients WHERE id = v_id;
                v_id := v_owner;
            END IF;
        END IF;
    END IF;

    -- Дописываем недостающие привязки: у клиента может быть несколько каналов.
    IF p_messenger_id IS NOT NULL THEN
        INSERT INTO public.client_external_ids (provider, kind, external_id, client_id)
        VALUES ('oko', 'messenger', p_messenger_id, v_id)
        ON CONFLICT (provider, kind, external_id) DO NOTHING;
    END IF;
    IF p_client_id IS NOT NULL THEN
        INSERT INTO public.client_external_ids (provider, kind, external_id, client_id)
        VALUES ('oko', 'client', p_client_id, v_id)
        ON CONFLICT (provider, kind, external_id) DO NOTHING;
    END IF;

    -- Массивы в карточке держим в согласии с таблицей привязок.
    UPDATE public.clients AS c
       SET oko_messenger_ids = COALESCE((
               SELECT array_agg(DISTINCT e.external_id)
                 FROM public.client_external_ids AS e
                WHERE e.client_id = c.id AND e.provider = 'oko' AND e.kind = 'messenger'), '{}'),
           oko_client_ids = COALESCE((
               SELECT array_agg(DISTINCT e.external_id)
                 FROM public.client_external_ids AS e
                WHERE e.client_id = c.id AND e.provider = 'oko' AND e.kind = 'client'), '{}'),
           updated_at = now()
     WHERE c.id = v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_find_or_create_client(bigint, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_find_or_create_client(bigint, bigint, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Сведение карточек — только временных, с переносом привязок
-- ─────────────────────────────────────────────────────────────────────────

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

    -- Только явно временная карточка: «нет номера контакта ОКО» мало —
    -- клиент, заведённый в нашей программе руками, тоже без него.
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_from AND is_provisional) THEN
        RAISE EXCEPTION 'Переносить можно только временную карточку из переписки';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_into) THEN
        RAISE EXCEPTION 'Клиент, к которому привязываем, не найден';
    END IF;

    UPDATE public.clients AS target
       SET phones = (SELECT COALESCE(array_agg(DISTINCT x), '{}')
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

    -- Привязки переезжают: конфликт означает, что она уже у получателя.
    UPDATE public.client_external_ids AS e
       SET client_id = p_into
     WHERE e.client_id = p_from
       AND NOT EXISTS (
           SELECT 1 FROM public.client_external_ids AS x
            WHERE x.provider = e.provider AND x.kind = e.kind
              AND x.external_id = e.external_id AND x.client_id = p_into);

    UPDATE public.deal_messages SET client_id = p_into WHERE client_id = p_from;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    UPDATE public.deals      SET client_id = p_into WHERE client_id = p_from;
    UPDATE public.oko_outbox SET client_id = p_into WHERE client_id = p_from;

    DELETE FROM public.clients WHERE id = p_from;

    -- Массивы получателя приводим в согласие с привязками.
    UPDATE public.clients AS c
       SET oko_messenger_ids = COALESCE((
               SELECT array_agg(DISTINCT e.external_id)
                 FROM public.client_external_ids AS e
                WHERE e.client_id = c.id AND e.provider = 'oko' AND e.kind = 'messenger'), '{}'),
           oko_client_ids = COALESCE((
               SELECT array_agg(DISTINCT e.external_id)
                 FROM public.client_external_ids AS e
                WHERE e.client_id = c.id AND e.provider = 'oko' AND e.kind = 'client'), '{}')
     WHERE c.id = p_into;

    RETURN v_moved;
END;
$$;

/** Отчёт по временным карточкам — теперь по явному признаку. */
DROP FUNCTION IF EXISTS public.oko_temp_card_matches();
CREATE FUNCTION public.oko_temp_card_matches()
RETURNS TABLE (
    temp_id          uuid,
    temp_name        text,
    temp_messages    bigint,
    real_id          uuid,
    real_name        text,
    real_contact_id  bigint,
    candidates       integer,
    phone_match      boolean,
    name_match       boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH temp AS (
        SELECT t.id, t.name, t.phones, t.oko_messenger_ids, t.oko_client_ids
          FROM public.clients AS t
         WHERE t.is_provisional
           AND (cardinality(t.oko_messenger_ids) > 0 OR cardinality(t.oko_client_ids) > 0)
    ),
    pairs AS (
        SELECT t.id AS temp_id,
               r.id AS real_id,
               r.name AS real_name,
               r.oko_contact_id,
               (t.phones && r.phones) AS phone_match,
               (lower(btrim(COALESCE(t.name, ''))) = lower(btrim(COALESCE(r.name, '')))
                AND btrim(COALESCE(t.name, '')) <> '') AS name_match
          FROM temp AS t
          JOIN public.clients AS r
            ON r.id <> t.id
           AND NOT r.is_provisional
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
           p.phone_match,
           p.name_match
      FROM temp AS t
      LEFT JOIN counted AS c ON c.temp_id = t.id
      LEFT JOIN pairs AS p ON p.temp_id = t.id AND c.n = 1
     ORDER BY COALESCE(c.n, 0) DESC, t.name NULLS LAST
$$;

REVOKE ALL ON FUNCTION public.oko_temp_card_matches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_temp_card_matches() TO service_role;

/** Привязка чата к клиенту — тоже через таблицу привязок. */
CREATE OR REPLACE FUNCTION public.oko_attach_chat(p_messenger_id bigint, p_client uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_moved integer;
    v_owner uuid;
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

    SELECT e.client_id INTO v_owner
      FROM public.client_external_ids AS e
     WHERE e.provider = 'oko' AND e.kind = 'messenger' AND e.external_id = p_messenger_id
     FOR UPDATE;

    -- Отнять переписку у настоящего клиента молча нельзя.
    IF v_owner IS NOT NULL AND v_owner <> p_client
       AND NOT EXISTS (SELECT 1 FROM public.clients WHERE id = v_owner AND is_provisional) THEN
        RAISE EXCEPTION 'Эта переписка уже привязана к другому клиенту — разберите вручную';
    END IF;

    INSERT INTO public.client_external_ids (provider, kind, external_id, client_id)
    VALUES ('oko', 'messenger', p_messenger_id, p_client)
    ON CONFLICT (provider, kind, external_id) DO UPDATE SET client_id = EXCLUDED.client_id;

    UPDATE public.clients AS c
       SET oko_messenger_ids = (
               SELECT COALESCE(array_agg(DISTINCT x), '{}')
                 FROM unnest(c.oko_messenger_ids || ARRAY[p_messenger_id]) AS x),
           updated_at = now()
     WHERE c.id = p_client;

    IF v_owner IS NOT NULL AND v_owner <> p_client THEN
        UPDATE public.clients AS c
           SET oko_messenger_ids = array_remove(c.oko_messenger_ids, p_messenger_id)
         WHERE c.id = v_owner;
    END IF;

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
    DELETE FROM _links;

    INSERT INTO _links (contact_id, kind, external_id)
    SELECT (r ->> 'oko_contact_id')::bigint, 'messenger', t.val::bigint
      FROM jsonb_array_elements(p_rows) AS r
      CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(r -> 'oko_messenger_ids') = 'array'
                 THEN r -> 'oko_messenger_ids' ELSE '[]'::jsonb END) AS t(val)
     WHERE jsonb_typeof(r -> 'oko_contact_id') = 'number' AND t.val ~ '^[0-9]+$';

    INSERT INTO _links (contact_id, kind, external_id)
    SELECT (r ->> 'oko_contact_id')::bigint, 'client', t.val::bigint
      FROM jsonb_array_elements(p_rows) AS r
      CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(r -> 'oko_client_ids') = 'array'
                 THEN r -> 'oko_client_ids' ELSE '[]'::jsonb END) AS t(val)
     WHERE jsonb_typeof(r -> 'oko_contact_id') = 'number' AND t.val ~ '^[0-9]+$';

    -- Привязки: настоящий клиент забирает идентификатор у временной карточки.
    INSERT INTO public.client_external_ids (provider, kind, external_id, client_id)
    SELECT DISTINCT 'oko', l.kind, l.external_id, c.id
      FROM _links AS l
      JOIN public.clients AS c ON c.oko_contact_id = l.contact_id
    ON CONFLICT (provider, kind, external_id) DO UPDATE
        SET client_id = EXCLUDED.client_id
      WHERE (SELECT cl.is_provisional FROM public.clients AS cl
              WHERE cl.id = public.client_external_ids.client_id);

    WITH updated AS (
        UPDATE public.clients AS c
           SET oko_messenger_ids = COALESCE((
                   SELECT array_agg(DISTINCT e.external_id)
                     FROM public.client_external_ids AS e
                    WHERE e.client_id = c.id AND e.provider = 'oko' AND e.kind = 'messenger'), '{}'),
               oko_client_ids = COALESCE((
                   SELECT array_agg(DISTINCT e.external_id)
                     FROM public.client_external_ids AS e
                    WHERE e.client_id = c.id AND e.provider = 'oko' AND e.kind = 'client'), '{}'),
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
