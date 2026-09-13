-- Сверка с ОКО: сначала «ждущие» чаты (13.09.2026).
--
-- Вебхук ОКО присылает только сообщения клиентов, поэтому «Входящие» узнают
-- об ответе менеджера только после сверки (20260915120000_inbox_checked.sql).
-- Сверка раньше шла по кругу всех клиентов с номером контакта ОКО и не знала,
-- какие чаты важны. На 13.09 из 174 «ждущих» за три дня номер контакта был
-- известен только у 27: остальные — временные карточки, которые завёл вебхук,
-- а ОКО отдаёт переписку только по контакту или сделке.
--
-- Здесь:
--  * oko_chat_contacts — чей в ОКО этот чат. Сверка узнаёт контакт из новой
--    сделки (или из чтения по контакту) и сообщает приёму; карточки клиентов
--    при этом не меняются и не сводятся — это отдельное решение человека;
--  * oko_contact_checks — когда контакт последний раз брали на сверку, чтобы
--    не читать один и тот же чаще раза в 20 минут;
--  * oko_waiting_contacts_to_check — кого сверять первым: контакты чатов,
--    где клиент написал последним больше 20 минут назад и это не проверено;
--    затем подтверждённые, но проверенные больше часа назад.
--
-- Откат: DROP FUNCTION public.oko_waiting_contacts_to_check(integer),
-- public.oko_note_chat_contacts(bigint, bigint[]);
-- DROP TABLE public.oko_contact_checks, public.oko_chat_contacts.
BEGIN;

CREATE TABLE IF NOT EXISTS public.oko_chat_contacts (
    messenger_id   bigint      PRIMARY KEY,
    oko_contact_id bigint      NOT NULL,
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oko_chat_contacts_contact_idx ON public.oko_chat_contacts (oko_contact_id);

CREATE TABLE IF NOT EXISTS public.oko_contact_checks (
    oko_contact_id bigint      PRIMARY KEY,
    attempted_at   timestamptz NOT NULL
);

ALTER TABLE public.oko_chat_contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oko_contact_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oko_chat_contacts_admin_read ON public.oko_chat_contacts;
CREATE POLICY oko_chat_contacts_admin_read ON public.oko_chat_contacts FOR SELECT TO authenticated
    USING (public.current_app_role() = 'admin');
DROP POLICY IF EXISTS oko_contact_checks_admin_read ON public.oko_contact_checks;
CREATE POLICY oko_contact_checks_admin_read ON public.oko_contact_checks FOR SELECT TO authenticated
    USING (public.current_app_role() = 'admin');

REVOKE ALL ON public.oko_chat_contacts, public.oko_contact_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.oko_chat_contacts, public.oko_contact_checks TO authenticated;

/**
 * Запомнить, к какому контакту ОКО относятся чаты. В ОКО чат принадлежит
 * одному контакту, поэтому новое значение заменяет старое.
 */
CREATE OR REPLACE FUNCTION public.oko_note_chat_contacts(p_contact_id bigint, p_messenger_ids bigint[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    n integer;
BEGIN
    IF p_contact_id IS NULL OR p_contact_id <= 0 OR p_messenger_ids IS NULL THEN
        RETURN 0;
    END IF;

    INSERT INTO public.oko_chat_contacts AS cc (messenger_id, oko_contact_id, updated_at)
    SELECT DISTINCT m, p_contact_id, now()
      FROM unnest(p_messenger_ids[1:200]) AS m
     WHERE m > 0
    ON CONFLICT (messenger_id) DO UPDATE
       SET oko_contact_id = EXCLUDED.oko_contact_id,
           updated_at = now()
     WHERE cc.oko_contact_id IS DISTINCT FROM EXCLUDED.oko_contact_id;

    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_note_chat_contacts(bigint, bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_note_chat_contacts(bigint, bigint[]) TO service_role;

/**
 * Кого сверять первым. Выданные контакты сразу помечаются взятыми: следующий
 * заход их 20 минут не получит, даже если Mac mini оборвался на полпути.
 *
 * Берутся чаты за три дня, где клиент написал последним больше 20 минут
 * назад (раньше менеджер обычно ещё не успел ответить):
 *  1) не проверенные после последнего сообщения — сначала самые свежие;
 *  2) подтверждённые, но проверенные больше часа назад: экран такие уже
 *     не считает подтверждёнными — ответ мог уйти после проверки.
 * Контакт берётся из карточки клиента, иначе из oko_chat_contacts.
 */
CREATE OR REPLACE FUNCTION public.oko_waiting_contacts_to_check(p_limit integer DEFAULT 2)
RETURNS TABLE (oko_contact_id bigint, waiting_since timestamptz, unchecked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    WITH chats AS (
        SELECT i.waiting_since AS since,
               (i.checked_at IS NULL OR i.checked_at < i.last_at) AS not_checked,
               COALESCE(c.oko_contact_id, cc.oko_contact_id) AS contact_id
          FROM public.oko_inbox(3, 500) AS i
          LEFT JOIN public.clients AS c ON c.id = i.client_id
          LEFT JOIN public.oko_chat_contacts AS cc ON cc.messenger_id = i.messenger_id
         WHERE i.waiting_since IS NOT NULL
           AND i.waiting_since >= now() - interval '3 days'
           AND i.waiting_since <  now() - interval '20 minutes'
           AND (i.checked_at IS NULL
                OR i.checked_at < i.last_at
                OR i.checked_at < now() - interval '1 hour')
    ),
    per_contact AS (
        SELECT ch.contact_id, max(ch.since) AS since, bool_or(ch.not_checked) AS not_checked
          FROM chats AS ch
         WHERE ch.contact_id IS NOT NULL
         GROUP BY ch.contact_id
    ),
    picked AS (
        SELECT p.contact_id, p.since, p.not_checked
          FROM per_contact AS p
          LEFT JOIN public.oko_contact_checks AS k ON k.oko_contact_id = p.contact_id
         WHERE k.attempted_at IS NULL OR k.attempted_at < now() - interval '20 minutes'
         ORDER BY p.not_checked DESC, p.since DESC
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 2), 20))
    ),
    stamped AS (
        INSERT INTO public.oko_contact_checks AS k (oko_contact_id, attempted_at)
        SELECT pk.contact_id, now() FROM picked AS pk
        ON CONFLICT ON CONSTRAINT oko_contact_checks_pkey DO UPDATE SET attempted_at = EXCLUDED.attempted_at
        RETURNING k.oko_contact_id
    )
    SELECT pk.contact_id, pk.since, pk.not_checked
      FROM picked AS pk
      JOIN stamped AS s ON s.oko_contact_id = pk.contact_id
     ORDER BY pk.not_checked DESC, pk.since DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_waiting_contacts_to_check(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_waiting_contacts_to_check(integer) TO service_role;

COMMIT;
