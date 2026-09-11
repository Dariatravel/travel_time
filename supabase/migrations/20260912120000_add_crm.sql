-- Клиенты и сделки (этап 3 единой программы, 12.09.2026).
--
-- Клиенты переезжают из OKO CRM в шахматку: контакты, сделки с теми же семью
-- этапами воронки и переписки. Структура повторяет карточку сделки OKO
-- (см. abhazbereg-ideas/OKO-структура-интерфейса.md), чтобы менеджеры
-- работали по привычке. Идентификаторы OKO хранятся для повторного импорта
-- без дублей (upsert по oko_*_id).
--
-- Доступ на старте — только admin. Полный откат: DROP TABLE public.deal_messages,
-- public.deals, public.clients; папки src/features/Crm, src/app/main/{deals,clients,import},
-- src/app/api/crm.
BEGIN;

CREATE TABLE IF NOT EXISTS public.clients (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    oko_contact_id   bigint      UNIQUE,
    name             text,
    phones           text[]      NOT NULL DEFAULT '{}',
    emails           text[]      NOT NULL DEFAULT '{}',
    responsible      text,
    telegram_user_id text,
    note             text,
    oko_created_at   timestamptz,
    oko_url          text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clients_name_idx ON public.clients (lower(name));
CREATE INDEX IF NOT EXISTS clients_phones_idx ON public.clients USING gin (phones);

CREATE TABLE IF NOT EXISTS public.deals (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    oko_lead_id      bigint      UNIQUE,
    client_id        uuid        REFERENCES public.clients (id) ON DELETE SET NULL,
    oko_contact_id   bigint,                 -- для связки при импорте, до client_id
    reserve_id       uuid        REFERENCES public.reserves (id) ON DELETE SET NULL,
    title            text,
    pipeline         text        NOT NULL DEFAULT 'sales' CHECK (pipeline IN ('sales', 'refund', 'archive')),
    stage            text        NOT NULL DEFAULT 'zayavka'
                                 CHECK (stage IN ('zayavka', 'podbor', 'dumayut', 'utochnit', 'zhdem_oplatu',
                                                  'bron', 'otkaz', 'zayavka_na_vozvrat', 'vozvrat',
                                                  'nevozvratnaya_otmena', 'arhiv')),
    source           text,                   -- Avito / VK / WhatsApp / Telegram / Max
    responsible      text,
    hotel_full       text,                   -- шапка отеля как в OKO (название, адрес, телефон)
    hotel_title      text,
    check_in         date,
    check_out        date,
    people           numeric,
    price_per_night  numeric,
    nights           numeric,
    service_note     text,
    total            numeric,
    prepaid          numeric,
    to_pay           numeric,
    payment_bank     text,
    payment_date     date,
    comment          text,
    refund_amount    numeric,
    penalty          numeric,
    tags             text[]      NOT NULL DEFAULT '{}',
    oko_created_at   timestamptz,
    oko_updated_at   timestamptz,
    oko_closed_at    timestamptz,
    arrived_stage_at timestamptz,
    oko_url          text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       text
);

CREATE INDEX IF NOT EXISTS deals_stage_idx ON public.deals (pipeline, stage, arrived_stage_at DESC);
CREATE INDEX IF NOT EXISTS deals_client_idx ON public.deals (client_id);
CREATE INDEX IF NOT EXISTS deals_oko_contact_idx ON public.deals (oko_contact_id);
CREATE INDEX IF NOT EXISTS deals_created_idx ON public.deals (oko_created_at DESC);

-- Переписка в OKO принадлежит контакту («Чаты с клиентами»), а не сделке:
-- чат хранится у клиента, сделка — справочная ссылка.
CREATE TABLE IF NOT EXISTS public.deal_messages (
    id             bigserial   PRIMARY KEY,
    oko_message_id bigint      UNIQUE,
    client_id      uuid        REFERENCES public.clients (id) ON DELETE CASCADE,
    oko_contact_id bigint,                   -- для связки при импорте, до client_id
    deal_id        uuid        REFERENCES public.deals (id) ON DELETE SET NULL,
    oko_lead_id    bigint,                   -- для связки при импорте, до deal_id
    direction      text        NOT NULL CHECK (direction IN ('in', 'out')),
    author_type    text,
    author_name    text,
    integration_id integer,
    text           text,
    files          text[]      NOT NULL DEFAULT '{}',
    sent_at        timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_messages_client_idx ON public.deal_messages (client_id, sent_at);
CREATE INDEX IF NOT EXISTS deal_messages_deal_idx ON public.deal_messages (deal_id, sent_at);

ALTER TABLE public.clients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clients_admin_all ON public.clients;
CREATE POLICY clients_admin_all ON public.clients FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
DROP POLICY IF EXISTS deals_admin_all ON public.deals;
CREATE POLICY deals_admin_all ON public.deals FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
DROP POLICY IF EXISTS deal_messages_admin_all ON public.deal_messages;
CREATE POLICY deal_messages_admin_all ON public.deal_messages FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_messages TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.deal_messages_id_seq  TO authenticated;

-- Счётчик и сумма по этапам — шапка колонок канбана, как в OKO. Права
-- вызывающего (RLS сохраняется): не-admin получит пустой результат.
CREATE OR REPLACE FUNCTION public.crm_stage_stats(p_pipeline text)
RETURNS TABLE (stage text, count bigint, sum numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT d.stage, count(*)::bigint, coalesce(sum(d.total), 0)::numeric
      FROM public.deals AS d
     WHERE d.pipeline = p_pipeline
     GROUP BY d.stage
$$;

REVOKE ALL ON FUNCTION public.crm_stage_stats(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_stage_stats(text) TO authenticated;

-- Поиск контактов: имя — подстрокой, телефон — по цифрам в любом из номеров
-- (в базе 36 тыс. контактов, искать «7900…» перебором на клиенте нельзя).
CREATE OR REPLACE FUNCTION public.crm_search_clients(p_name text, p_digits text, p_limit integer DEFAULT 100)
RETURNS SETOF public.clients
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT c.*
      FROM public.clients AS c
     WHERE (p_name IS NULL OR p_name = '' OR c.name ILIKE '%' || p_name || '%')
       AND (p_digits IS NULL OR p_digits = '' OR EXISTS (
                SELECT 1 FROM unnest(c.phones) AS ph
                 WHERE regexp_replace(ph, '\D', '', 'g') LIKE '%' || p_digits || '%'))
     ORDER BY c.oko_created_at DESC NULLS LAST, c.created_at DESC
     LIMIT LEAST(GREATEST(p_limit, 1), 500)
$$;

REVOKE ALL ON FUNCTION public.crm_search_clients(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_search_clients(text, text, integer) TO authenticated;

-- Связка импортированных строк (клиент по oko_contact_id, сделка по oko_lead_id)
-- делается в роуте импорта по каждой пачке: один UPDATE на 220 тысяч строк не
-- уложился бы в 30 секунд контейнера.

COMMIT;
