-- Живая связь с CRM ОКО (12.09.2026).
--
-- До 1 ноября менеджеры работают в ОКО, а АБХАЗБИЗНЕС отлаживается рядом:
-- входящие сообщения приходят к нам сразу, а часть действий уходит обратно
-- в ОКО через его API («ОКО как труба»).
--
-- Как устроено:
--   входящее  — ОКО шлёт вебхук client_message на /api/oko/webhook. Событие
--               СНАЧАЛА целиком пишется в oko_webhook_events (сбой разбора
--               не теряет сообщение), потом разбирается;
--   исходящее — АБХАЗБИЗНЕС кладёт задание в oko_outbox, Mac mini (токен ОКО
--               только там) раз в минуту забирает задания функцией
--               oko_outbox_claim и отправляет. Лимит ОКО — 5 запросов в
--               минуту на весь аккаунт, поэтому очередь обязательна.
--
-- Опознание клиента. В событии приходит ЛИБО contact_messenger_id (переписка
-- в мессенджере), ЛИБО client_id — почти никогда оба сразу. Поэтому у клиента
-- два массива идентификаторов ОКО; они же заполняются из выгрузки, иначе
-- живые сообщения не нашли бы 36 тысяч перенесённых клиентов.
--
-- Откат: DROP FUNCTION public.oko_outbox_claim(int), public.oko_find_or_create_client(bigint,bigint,text);
-- DROP TABLE public.oko_outbox, public.oko_webhook_events, public.oko_settings;
-- ALTER TABLE public.clients DROP COLUMN oko_messenger_ids, DROP COLUMN oko_client_ids,
-- DROP COLUMN last_incoming_at; ALTER TABLE public.deal_messages DROP COLUMN oko_client_id,
-- DROP COLUMN oko_contact_messenger_id, DROP COLUMN source; папка src/app/api/oko.
BEGIN;

-- Куда отвечать клиенту: ОКО требует client_id и contact_messenger_id.
ALTER TABLE public.deal_messages
    ADD COLUMN IF NOT EXISTS oko_client_id bigint,
    ADD COLUMN IF NOT EXISTS oko_contact_messenger_id bigint,
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'import'
        CHECK (source IN ('import', 'webhook', 'outbox'));

CREATE INDEX IF NOT EXISTS deal_messages_sent_idx ON public.deal_messages (sent_at DESC);
CREATE INDEX IF NOT EXISTS deal_messages_messenger_idx ON public.deal_messages (oko_contact_messenger_id);

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS oko_messenger_ids bigint[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS oko_client_ids bigint[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS last_incoming_at timestamptz;

CREATE INDEX IF NOT EXISTS clients_oko_messenger_idx ON public.clients USING gin (oko_messenger_ids);
CREATE INDEX IF NOT EXISTS clients_oko_client_idx ON public.clients USING gin (oko_client_ids);
CREATE INDEX IF NOT EXISTS clients_last_incoming_idx ON public.clients (last_incoming_at DESC NULLS LAST);

-- Сырые события: пишутся до разбора, поэтому сбой ничего не теряет.
CREATE TABLE IF NOT EXISTS public.oko_webhook_events (
    oko_message_id bigint      PRIMARY KEY,
    payload        jsonb       NOT NULL,
    processed_at   timestamptz,
    error          text,
    received_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oko_webhook_events_unprocessed_idx
    ON public.oko_webhook_events (received_at) WHERE processed_at IS NULL;

-- Выключатель отправки: остановить можно из базы, без перевыкатки.
CREATE TABLE IF NOT EXISTS public.oko_settings (
    key        text        PRIMARY KEY,
    value      text        NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text
);

INSERT INTO public.oko_settings (key, value) VALUES ('sender_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- Очередь заданий в ОКО.
CREATE TABLE IF NOT EXISTS public.oko_outbox (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        text        NOT NULL CHECK (kind IN ('message', 'lead_update', 'task_create')),
    priority    integer     NOT NULL DEFAULT 5,
    payload     jsonb       NOT NULL,
    status      text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled', 'stuck')),
    attempts    integer     NOT NULL DEFAULT 0,
    last_error  text,
    result      jsonb,
    deal_id     uuid        REFERENCES public.deals (id) ON DELETE SET NULL,
    client_id   uuid        REFERENCES public.clients (id) ON DELETE SET NULL,
    created_by  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    sending_at  timestamptz,
    sent_at     timestamptz,
    -- Форма задания проверяется здесь: в очередь пишут из браузера.
    CONSTRAINT oko_outbox_payload_shape CHECK (
        CASE kind
            WHEN 'message' THEN
                jsonb_typeof(payload -> 'contact_messenger_id') = 'number'
                AND jsonb_typeof(payload -> 'text') = 'string'
                AND length(payload ->> 'text') BETWEEN 1 AND 4000
            WHEN 'lead_update' THEN
                jsonb_typeof(payload -> 'lead_id') = 'number'
                AND jsonb_typeof(payload -> 'fields') = 'object'
            WHEN 'task_create' THEN
                jsonb_typeof(payload -> 'lead_id') = 'number'
            ELSE false
        END
    )
);

CREATE INDEX IF NOT EXISTS oko_outbox_queue_idx ON public.oko_outbox (status, priority, created_at)
    WHERE status IN ('pending', 'sending');
CREATE INDEX IF NOT EXISTS oko_outbox_deal_idx ON public.oko_outbox (deal_id, created_at DESC);

/**
 * Найти клиента по идентификаторам ОКО или завести нового — одной операцией,
 * чтобы два одновременных сообщения не создали две карточки.
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
    v_id uuid;
BEGIN
    IF p_messenger_id IS NULL AND p_client_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT c.id INTO v_id
      FROM public.clients AS c
     WHERE (p_messenger_id IS NOT NULL AND c.oko_messenger_ids @> ARRAY[p_messenger_id])
        OR (p_client_id IS NOT NULL AND c.oko_client_ids @> ARRAY[p_client_id])
     ORDER BY c.oko_contact_id NULLS LAST
     LIMIT 1;

    IF v_id IS NOT NULL THEN
        -- Дописываем недостающий идентификатор: у клиента может быть несколько каналов.
        UPDATE public.clients AS c
           SET oko_messenger_ids = CASE
                   WHEN p_messenger_id IS NULL OR c.oko_messenger_ids @> ARRAY[p_messenger_id]
                   THEN c.oko_messenger_ids ELSE c.oko_messenger_ids || p_messenger_id END,
               oko_client_ids = CASE
                   WHEN p_client_id IS NULL OR c.oko_client_ids @> ARRAY[p_client_id]
                   THEN c.oko_client_ids ELSE c.oko_client_ids || p_client_id END,
               updated_at = now()
         WHERE c.id = v_id;
        RETURN v_id;
    END IF;

    INSERT INTO public.clients (name, oko_messenger_ids, oko_client_ids, note)
    VALUES (
        COALESCE(NULLIF(btrim(p_name), ''), 'Клиент из ОКО'),
        CASE WHEN p_messenger_id IS NULL THEN '{}'::bigint[] ELSE ARRAY[p_messenger_id] END,
        CASE WHEN p_client_id IS NULL THEN '{}'::bigint[] ELSE ARRAY[p_client_id] END,
        'Заведён по живому сообщению из ОКО'
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_find_or_create_client(bigint, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_find_or_create_client(bigint, bigint, text) TO service_role;

/**
 * Забрать задания в работу. FOR UPDATE SKIP LOCKED — два отправителя не возьмут
 * одно и то же задание и клиент не получит два одинаковых сообщения.
 * Заодно возвращает в работу ничьи задания: те, что «отправляются» дольше
 * пяти минут, помечаются stuck — их разбирает человек, потому что отправка
 * могла и пройти (повторять её вслепую нельзя).
 */
CREATE OR REPLACE FUNCTION public.oko_outbox_claim(p_limit integer DEFAULT 2)
RETURNS SETOF public.oko_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.oko_outbox
       SET status = 'stuck',
           last_error = 'отправитель не отчитался — проверьте вручную, сообщение могло уйти'
     WHERE status = 'sending' AND sending_at < now() - interval '5 minutes';

    IF COALESCE((SELECT s.value FROM public.oko_settings AS s WHERE s.key = 'sender_enabled'), 'true') <> 'true' THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH picked AS (
        SELECT o.id
          FROM public.oko_outbox AS o
         WHERE o.status = 'pending' AND o.attempts < 5
         ORDER BY o.priority, o.created_at
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 2), 3))
           FOR UPDATE SKIP LOCKED
    )
    UPDATE public.oko_outbox AS o
       SET status = 'sending', sending_at = now()
      FROM picked
     WHERE o.id = picked.id
    RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_outbox_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_outbox_claim(integer) TO service_role;

ALTER TABLE public.oko_outbox         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oko_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oko_settings       ENABLE ROW LEVEL SECURITY;

-- Пока в бою только Дарья: очередь и настройки — admin. Операторам откроем
-- вместе с остальными разделами, добавив 'operator' в политику.
DROP POLICY IF EXISTS oko_outbox_admin_all ON public.oko_outbox;
CREATE POLICY oko_outbox_admin_all ON public.oko_outbox FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
DROP POLICY IF EXISTS oko_settings_admin_all ON public.oko_settings;
CREATE POLICY oko_settings_admin_all ON public.oko_settings FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
-- Сырые события наружу не отдаём вовсе: там переписка как есть.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oko_outbox   TO authenticated;
GRANT SELECT, UPDATE                 ON public.oko_settings TO authenticated;

COMMIT;
