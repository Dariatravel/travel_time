-- Живая связь с CRM ОКО (12.09.2026).
--
-- До 1 ноября менеджеры работают в ОКО, а АБХАЗБИЗНЕС отлаживается рядом:
-- входящие сообщения приходят к нам сразу, а часть действий уходит обратно
-- в ОКО через его API («ОКО как труба»).
--
-- Как устроено:
--   входящее  — ОКО шлёт вебхук client_message на /api/oko/webhook, роут
--               пишет сообщение, при надобности заводит клиента и сделку;
--   исходящее — АБХАЗБИЗНЕС кладёт задание в oko_outbox, Mac mini (там лежит
--               токен ОКО) раз в минуту забирает задания через /api/oko/outbox
--               и отправляет в ОКО. У ОКО лимит 5 запросов в минуту на весь
--               аккаунт, поэтому очередь обязательна.
--
-- Откат: DROP TABLE public.oko_outbox; ALTER TABLE public.deal_messages
-- DROP COLUMN oko_client_id, DROP COLUMN oko_contact_messenger_id, DROP COLUMN source;
-- ALTER TABLE public.clients DROP COLUMN oko_client_id, DROP COLUMN oko_contact_messenger_id,
-- DROP COLUMN last_incoming_at; роут src/app/api/oko.
BEGIN;

-- Куда отвечать клиенту: ОКО требует client_id и contact_messenger_id.
ALTER TABLE public.deal_messages
    ADD COLUMN IF NOT EXISTS oko_client_id bigint,
    ADD COLUMN IF NOT EXISTS oko_contact_messenger_id bigint,
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'import'
        CHECK (source IN ('import', 'webhook', 'outbox'));

CREATE INDEX IF NOT EXISTS deal_messages_sent_idx ON public.deal_messages (sent_at DESC);

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS oko_client_id bigint,
    ADD COLUMN IF NOT EXISTS oko_contact_messenger_id bigint,
    ADD COLUMN IF NOT EXISTS last_incoming_at timestamptz;

CREATE INDEX IF NOT EXISTS clients_last_incoming_idx ON public.clients (last_incoming_at DESC NULLS LAST);

-- Очередь заданий в ОКО. Больше 5 запросов в минуту ОКО не принимает,
-- поэтому отправка идёт по одному, с приоритетом: сообщения клиенту важнее
-- обновления полей сделки.
CREATE TABLE IF NOT EXISTS public.oko_outbox (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        text        NOT NULL CHECK (kind IN ('message', 'lead_update', 'task_create')),
    priority    integer     NOT NULL DEFAULT 5,
    payload     jsonb       NOT NULL,
    status      text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
    attempts    integer     NOT NULL DEFAULT 0,
    last_error  text,
    result      jsonb,
    deal_id     uuid        REFERENCES public.deals (id) ON DELETE SET NULL,
    client_id   uuid        REFERENCES public.clients (id) ON DELETE SET NULL,
    created_by  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    sent_at     timestamptz
);

CREATE INDEX IF NOT EXISTS oko_outbox_queue_idx ON public.oko_outbox (status, priority, created_at)
    WHERE status IN ('pending', 'sending');
CREATE INDEX IF NOT EXISTS oko_outbox_deal_idx ON public.oko_outbox (deal_id, created_at DESC);

ALTER TABLE public.oko_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oko_outbox_staff_all ON public.oko_outbox;
CREATE POLICY oko_outbox_staff_all ON public.oko_outbox FOR ALL TO authenticated
    USING (public.current_app_role() IN ('admin', 'operator'))
    WITH CHECK (public.current_app_role() IN ('admin', 'operator'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oko_outbox TO authenticated;

COMMIT;
