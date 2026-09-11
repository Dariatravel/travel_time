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

CREATE TABLE IF NOT EXISTS public.deal_messages (
    id             bigserial   PRIMARY KEY,
    oko_message_id bigint      UNIQUE,
    deal_id        uuid        REFERENCES public.deals (id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS deal_messages_deal_idx ON public.deal_messages (deal_id, sent_at);
CREATE INDEX IF NOT EXISTS deal_messages_oko_lead_idx ON public.deal_messages (oko_lead_id);

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

-- Связка импортированных строк: клиент по oko_contact_id, сообщения по oko_lead_id.
CREATE OR REPLACE FUNCTION public.crm_link_imported()
RETURNS TABLE (deals_linked bigint, messages_linked bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    d bigint;
    m bigint;
BEGIN
    UPDATE public.deals AS dl
       SET client_id = c.id
      FROM public.clients AS c
     WHERE dl.client_id IS NULL AND dl.oko_contact_id IS NOT NULL AND c.oko_contact_id = dl.oko_contact_id;
    GET DIAGNOSTICS d = ROW_COUNT;
    UPDATE public.deal_messages AS dm
       SET deal_id = dl.id
      FROM public.deals AS dl
     WHERE dm.deal_id IS NULL AND dm.oko_lead_id IS NOT NULL AND dl.oko_lead_id = dm.oko_lead_id;
    GET DIAGNOSTICS m = ROW_COUNT;
    RETURN QUERY SELECT d, m;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_link_imported() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_link_imported() TO service_role;

COMMIT;
