-- Общая схема мессенджеров; первый канал — Instagram через Wazzup (15.09.2026).
--
-- ОКО отключают 1 ноября 2026, мессенджеры переезжают в АБХАЗБИЗНЕС по одному.
-- Instagram идёт не через ОКО, а напрямую через посредника Wazzup. Схема
-- общая: те же таблицы примут WhatsApp и MAX из Wazzup, а позже — прямые
-- ВКонтакте, Telegram Business, MAX-бот и Авито (provider = откуда пришло,
-- chat_type = какой мессенджер).
--
-- Порядок приёма тот же, что у ОКО: сырое событие сначала сохраняется в
-- messenger_events, потом разбирается функцией messenger_ingest_batch.
-- Всё пишется по уникальным ключам, поэтому повтор события безвреден.
--
-- Доступ: читать может только admin (RLS), писать — только сервер
-- (service_role) через маршруты /api/wazzup/*. Таблицы ОКО не трогаются,
-- кроме сведения карточек: oko_merge_clients_unchecked теперь переносит и
-- привязки к мессенджерам (иначе переписка Instagram оторвалась бы).
--
-- Решения (15.09.2026): карточка клиента заводится только по Direct —
-- комментаторы под постами карточек не получают. Сообщения принимаются
-- только для каналов, известных в messenger_channels.
--
-- Откат: DROP TABLE public.messenger_outbox, public.messenger_messages,
-- public.messenger_pending_statuses, public.messenger_chats,
-- public.messenger_posts, public.messenger_events, public.messenger_channels,
-- public.client_identities; DROP FUNCTION public.messenger_*; вернуть
-- oko_merge_clients_unchecked из 20260914090000_reliability_db.sql;
-- папки src/app/api/wazzup, src/features/Instagram, src/app/main/instagram.
BEGIN;

-- Не висеть на блокировках рабочей базы: не дождались за 5 секунд — выкатка
-- падает честно, её можно повторить.
SET LOCAL lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Таблицы
-- ─────────────────────────────────────────────────────────────────────────

/** Подключённые каналы посредника (у Wazzup — channelId). Заполняет /api/wazzup/setup. */
CREATE TABLE IF NOT EXISTS public.messenger_channels (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider    text        NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
    external_id text        NOT NULL CHECK (btrim(external_id) <> ''),
    transport   text,
    plain_id    text,
    state       text,
    name        text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, external_id)
);

/**
 * Сырой журнал вебхуков. Событие сохраняется ДО разбора: если разбор не
 * удался, его переразберёт /api/wazzup/reprocess с растущими паузами.
 * В headers секретов нет: токен и авторизация вырезаются до записи.
 */
CREATE TABLE IF NOT EXISTS public.messenger_events (
    id           bigserial   PRIMARY KEY,
    provider     text        NOT NULL,
    payload      jsonb       NOT NULL,
    headers      jsonb,
    received_at  timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    attempts     integer     NOT NULL DEFAULT 0,
    next_try_at  timestamptz,
    error        text
);

CREATE INDEX IF NOT EXISTS messenger_events_retry_idx
    ON public.messenger_events (COALESCE(next_try_at, received_at))
    WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS messenger_events_received_idx
    ON public.messenger_events (received_at DESC);

/** Посты, под которыми пишут комментарии (у Wazzup — instPost). */
CREATE TABLE IF NOT EXISTS public.messenger_posts (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider      text        NOT NULL,
    external_id   text        NOT NULL CHECK (btrim(external_id) <> ''),
    src           text,
    description   text,
    author        text,
    posted_at     timestamptz,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, external_id)
);

/**
 * Чат — переписка с одним человеком в одном канале. Комментарии одного
 * автора под разными постами — разные чаты (kind = 'comment', свой post_id):
 * отвечать на них нужно по отдельности и в разные сроки.
 * У чатов-комментариев client_id пустой: карточки заводятся только по Direct.
 */
CREATE TABLE IF NOT EXISTS public.messenger_chats (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider            text        NOT NULL,
    channel_external_id text        NOT NULL,
    chat_type           text        NOT NULL,
    chat_id             text        NOT NULL CHECK (btrim(chat_id) <> ''),
    kind                text        NOT NULL CHECK (kind IN ('direct', 'comment')),
    post_id             uuid        REFERENCES public.messenger_posts (id) ON DELETE RESTRICT,
    client_id           uuid        REFERENCES public.clients (id) ON DELETE SET NULL,
    contact_name        text,
    contact_username    text,
    avatar_uri          text,
    last_inbound_at     timestamptz,
    last_outbound_at    timestamptz,
    last_message_at     timestamptz,
    -- Первое сообщение клиента после нашего последнего ответа; ответили — NULL.
    first_unanswered_at timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT messenger_chats_comment_has_post CHECK ((kind = 'comment') = (post_id IS NOT NULL))
);

-- Уникальность с учётом пустого post_id: у Direct его нет, и без COALESCE
-- два одинаковых Direct-чата не считались бы повтором (NULL <> NULL).
CREATE UNIQUE INDEX IF NOT EXISTS messenger_chats_key_idx
    ON public.messenger_chats (provider, channel_external_id, chat_type, chat_id, kind,
                               (COALESCE(post_id, '00000000-0000-0000-0000-000000000000'::uuid)));
CREATE INDEX IF NOT EXISTS messenger_chats_list_idx
    ON public.messenger_chats (chat_type, kind, last_message_at DESC);
CREATE INDEX IF NOT EXISTS messenger_chats_client_idx
    ON public.messenger_chats (client_id);

CREATE TABLE IF NOT EXISTS public.messenger_messages (
    id                 bigserial   PRIMARY KEY,
    provider           text        NOT NULL,
    external_id        text        NOT NULL CHECK (btrim(external_id) <> ''),
    chat_id            uuid        NOT NULL REFERENCES public.messenger_chats (id) ON DELETE CASCADE,
    direction          text        NOT NULL CHECK (direction IN ('in', 'out')),
    is_echo            boolean     NOT NULL DEFAULT false,
    sent_from_app      boolean     NOT NULL DEFAULT false,
    author_name        text,
    type               text,
    -- У удалённого клиентом сообщения текст, ссылка и сырое тело стираются.
    text               text,
    -- Только ссылка: медиа из упоминаний в историях Instagram хранить нельзя.
    content_uri        text,
    status             text,
    error              text,
    quoted_external_id text,
    is_edited          boolean     NOT NULL DEFAULT false,
    is_deleted         boolean     NOT NULL DEFAULT false,
    sent_at            timestamptz NOT NULL,
    raw                jsonb,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS messenger_messages_chat_idx
    ON public.messenger_messages (chat_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS messenger_messages_chat_dir_idx
    ON public.messenger_messages (chat_id, direction, sent_at);

/**
 * Статусы, пришедшие раньше самого сообщения. Wazzup не обещает порядок:
 * «ошибка доставки» может прийти до эха. Потерять её нельзя — иначе
 * недоставленный ответ считался бы ответом. Применяется при приёме сообщения.
 */
CREATE TABLE IF NOT EXISTS public.messenger_pending_statuses (
    provider    text        NOT NULL,
    external_id text        NOT NULL,
    status      text        NOT NULL,
    error       text,
    status_at   timestamptz,
    received_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, external_id)
);

/**
 * Наши ответы. id строки — ключ черновика с экрана; он же уходит в Wazzup
 * как crmMessageId. Повторное нажатие с тем же ключом не отправляет второй
 * раз. Статусы: pending — отправляется; sent — принято Wazzup; failed —
 * отказ или ошибка доставки; unknown — связь оборвалась, сообщение МОГЛО
 * уйти, автоматически не повторяем.
 */
CREATE TABLE IF NOT EXISTS public.messenger_outbox (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id             uuid        NOT NULL REFERENCES public.messenger_chats (id) ON DELETE RESTRICT,
    mode                text        NOT NULL CHECK (mode IN ('direct', 'comment_public', 'comment_private')),
    ref_external_id     text,
    text                text        NOT NULL CHECK (btrim(text) <> '' AND char_length(text) <= 4096),
    status              text        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'sent', 'failed', 'unknown')),
    external_message_id text,
    error               text,
    created_by          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    sent_at             timestamptz,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT messenger_outbox_comment_has_ref CHECK (mode = 'direct' OR ref_external_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS messenger_outbox_chat_idx
    ON public.messenger_outbox (chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messenger_outbox_external_idx
    ON public.messenger_outbox (external_message_id) WHERE external_message_id IS NOT NULL;

-- Instagram разрешает один приватный ответ на комментарий. Неудачный
-- (failed) не считается — его можно повторить.
CREATE UNIQUE INDEX IF NOT EXISTS messenger_outbox_one_private_idx
    ON public.messenger_outbox (chat_id, ref_external_id)
    WHERE mode = 'comment_private' AND status <> 'failed';

/**
 * Привязки клиента к внешним личностям (ник в Instagram, номер WhatsApp…).
 * Отдельно от client_external_ids ОКО: там ключ числовой и логика своя.
 * Ключ уникальный — одновременные первые сообщения не заведут двух клиентов.
 * ON DELETE RESTRICT: карточку с привязкой нельзя удалить мимо сведения —
 * иначе следующее сообщение молча завело бы новую временную карточку.
 */
CREATE TABLE IF NOT EXISTS public.client_identities (
    provider     text        NOT NULL,
    kind         text        NOT NULL,
    external_key text        NOT NULL CHECK (btrim(external_key) <> ''),
    client_id    uuid        NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, kind, external_key)
);

CREATE INDEX IF NOT EXISTS client_identities_client_idx
    ON public.client_identities (client_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Доступ: читает только admin, пишет только сервер
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['messenger_channels', 'messenger_events', 'messenger_posts',
                             'messenger_chats', 'messenger_messages', 'messenger_outbox',
                             'messenger_pending_statuses', 'client_identities']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_read', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
                       'USING (public.current_app_role() = ''admin'')', t || '_admin_read', t);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END LOOP;
END $$;

REVOKE ALL ON SEQUENCE public.messenger_events_id_seq, public.messenger_messages_id_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.messenger_events_id_seq, public.messenger_messages_id_seq TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Функции разбора (только сервер)
-- ─────────────────────────────────────────────────────────────────────────

/**
 * Порядок статусов доставки: запоздавший «доставлено» не должен откатить
 * «прочитано». Ошибка сильнее всех — о ней надо узнать в любом случае.
 */
CREATE OR REPLACE FUNCTION public.messenger_status_rank(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE lower(COALESCE(p_status, ''))
        WHEN 'sent'      THEN 1
        WHEN 'delivered' THEN 2
        WHEN 'read'      THEN 3
        WHEN 'error'     THEN 4
        ELSE 0
    END;
$$;

/**
 * Текст для сравнения эха с нашей отправкой: переносы \r\n → \n, пробелы по
 * краям убраны. Сервер сохраняет отправку в том же виде (normalizeOutgoingText).
 */
CREATE OR REPLACE FUNCTION public.messenger_norm_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT regexp_replace(replace(COALESCE(p_text, ''), E'\r\n', E'\n'), '^\s+|\s+$', '', 'g');
$$;

/**
 * Пересчитать отметки чата по сообщениям — независимо от порядка, в котором
 * пришли события. «Ждёт ответа» = первое входящее после нашего последнего
 * ответа. Ответом считается исходящее сообщение и принятая Wazzup отправка
 * из очереди (приватный ответ на комментарий уходит в Direct, и его эхо в
 * чат комментария не попадёт). Недоставленное (error / failed) — не ответ.
 */
CREATE OR REPLACE FUNCTION public.messenger_refresh_chat(p_chat uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE public.messenger_chats AS c
       SET last_inbound_at  = s.last_in,
           last_outbound_at = s.last_out,
           last_message_at  = s.last_any,
           first_unanswered_at = (
               SELECT min(m.sent_at)
                 FROM public.messenger_messages AS m
                WHERE m.chat_id = c.id
                  AND m.direction = 'in'
                  AND m.sent_at > COALESCE(s.last_out, '-infinity'::timestamptz)),
           updated_at = now()
      FROM (
          SELECT (SELECT max(m.sent_at) FROM public.messenger_messages AS m
                   WHERE m.chat_id = p_chat AND m.direction = 'in') AS last_in,
                 GREATEST(
                     (SELECT max(m.sent_at) FROM public.messenger_messages AS m
                       WHERE m.chat_id = p_chat AND m.direction = 'out'
                         AND COALESCE(m.status, '') <> 'error'
                         AND NOT EXISTS (
                             SELECT 1 FROM public.messenger_outbox AS o
                              WHERE o.external_message_id = m.external_id AND o.status = 'failed')),
                     (SELECT max(o.sent_at) FROM public.messenger_outbox AS o
                       WHERE o.chat_id = p_chat AND o.status = 'sent')) AS last_out,
                 (SELECT max(m.sent_at) FROM public.messenger_messages AS m
                   WHERE m.chat_id = p_chat) AS last_any
      ) AS s
     WHERE c.id = p_chat;
$$;

REVOKE ALL ON FUNCTION public.messenger_refresh_chat(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.messenger_refresh_chat(uuid) TO service_role;

/**
 * Найти или завести временного клиента по внешней личности — атомарно.
 * Не нашли — заводим карточку и занимаем привязку; если её в этот момент
 * занял параллельный запрос, свою карточку удаляем и берём его клиента.
 * Ник Instagram не зависит от регистра и может прийти с «@».
 */
CREATE OR REPLACE FUNCTION public.messenger_find_or_create_client(
    p_provider     text,
    p_kind         text,
    p_external_key text,
    p_name         text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_key   text := btrim(COALESCE(p_external_key, ''));
    v_id    uuid;
    v_owner uuid;
BEGIN
    IF p_kind = 'instagram' THEN
        v_key := lower(ltrim(v_key, '@'));
    END IF;
    IF v_key = '' OR COALESCE(p_provider, '') = '' OR COALESCE(p_kind, '') = '' THEN
        RETURN NULL;
    END IF;

    SELECT i.client_id INTO v_id
      FROM public.client_identities AS i
     WHERE i.provider = p_provider AND i.kind = p_kind AND i.external_key = v_key;
    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    INSERT INTO public.clients (name, note, is_provisional)
    VALUES (
        COALESCE(NULLIF(btrim(p_name), ''),
                 CASE WHEN p_kind = 'instagram' THEN '@' || v_key ELSE 'Клиент из ' || p_kind END),
        CASE WHEN p_kind = 'instagram' THEN 'Заведён по сообщению из Instagram'
             ELSE format('Заведён по сообщению из %s', p_kind) END,
        true
    )
    RETURNING id INTO v_id;

    INSERT INTO public.client_identities (provider, kind, external_key, client_id)
    VALUES (p_provider, p_kind, v_key, v_id)
    ON CONFLICT (provider, kind, external_key) DO NOTHING
    RETURNING client_id INTO v_owner;

    IF v_owner IS NULL THEN
        -- Параллельный запрос успел раньше: дубль не нужен. Привязки у нашей
        -- карточки нет, поэтому удаление не упрётся в RESTRICT.
        DELETE FROM public.clients WHERE id = v_id;
        SELECT i.client_id INTO v_owner
          FROM public.client_identities AS i
         WHERE i.provider = p_provider AND i.kind = p_kind AND i.external_key = v_key;
        RETURN v_owner;
    END IF;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.messenger_find_or_create_client(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.messenger_find_or_create_client(text, text, text, text) TO service_role;

/**
 * Записать одно сообщение (уже нормализованное сервером, см.
 * src/app/api/wazzup/_lib/normalize.ts): пост → чат → клиент (только Direct)
 * → сообщение → статус (свой, отложенный, из очереди) → связь с очередью →
 * пересчёт чата. Всё по ключам. Неизвестный канал — отказ с кодом
 * no_data_found: пакетная функция отличает его от прочих ошибок.
 */
CREATE OR REPLACE FUNCTION public.messenger_ingest_message(p_provider text, p_msg jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ext      text := p_msg ->> 'external_id';
    v_kind     text := p_msg ->> 'kind';
    v_dir      text := p_msg ->> 'direction';
    v_type     text := p_msg ->> 'chat_type';
    v_chat_key text := btrim(COALESCE(p_msg ->> 'chat_id', ''));
    v_channel  text := p_msg ->> 'channel_external_id';
    v_sent     timestamptz := COALESCE((p_msg ->> 'sent_at')::timestamptz, now());
    v_deleted  boolean := COALESCE((p_msg ->> 'is_deleted')::boolean, false);
    v_from_app boolean := COALESCE((p_msg ->> 'sent_from_app')::boolean, false);
    v_status   text := lower(NULLIF(p_msg ->> 'status', ''));
    v_error    text := p_msg ->> 'error';
    v_pending  record;
    v_post     uuid;
    v_chat     uuid;
    v_client   uuid;
    v_msg      bigint;
    v_inserted boolean;
    v_failed   boolean;
    v_outchat  uuid;
BEGIN
    IF COALESCE(p_provider, '') = '' OR COALESCE(v_ext, '') = '' OR COALESCE(v_channel, '') = ''
       OR COALESCE(v_type, '') = '' OR v_chat_key = ''
       OR v_kind NOT IN ('direct', 'comment') OR v_dir NOT IN ('in', 'out') THEN
        RAISE EXCEPTION 'Сообщение без обязательных полей: %', left(p_msg::text, 200);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.messenger_channels AS ch
                    WHERE ch.provider = p_provider AND ch.external_id = v_channel) THEN
        RAISE EXCEPTION 'неизвестный канал %', v_channel USING ERRCODE = 'no_data_found';
    END IF;

    -- Ник Instagram — без регистра и «@»: kate и Kate — один чат.
    IF v_type = 'instagram' THEN
        v_chat_key := lower(ltrim(v_chat_key, '@'));
    END IF;

    IF v_kind = 'comment' THEN
        IF COALESCE(p_msg #>> '{post,external_id}', '') = '' THEN
            RAISE EXCEPTION 'Комментарий без поста: %', v_ext;
        END IF;
        INSERT INTO public.messenger_posts (provider, external_id, src, description, author, posted_at)
        VALUES (p_provider,
                p_msg #>> '{post,external_id}',
                p_msg #>> '{post,src}',
                p_msg #>> '{post,description}',
                p_msg #>> '{post,author}',
                (p_msg #>> '{post,posted_at}')::timestamptz)
        ON CONFLICT (provider, external_id) DO UPDATE
            SET src         = COALESCE(EXCLUDED.src, public.messenger_posts.src),
                description = COALESCE(EXCLUDED.description, public.messenger_posts.description),
                author      = COALESCE(EXCLUDED.author, public.messenger_posts.author),
                posted_at   = COALESCE(EXCLUDED.posted_at, public.messenger_posts.posted_at),
                updated_at  = now()
        RETURNING id INTO v_post;
    END IF;

    INSERT INTO public.messenger_chats (provider, channel_external_id, chat_type, chat_id, kind, post_id,
                                        contact_name, contact_username, avatar_uri)
    VALUES (p_provider, v_channel, v_type, v_chat_key, v_kind, v_post,
            p_msg #>> '{contact,name}',
            p_msg #>> '{contact,username}',
            p_msg #>> '{contact,avatar_uri}')
    ON CONFLICT (provider, channel_external_id, chat_type, chat_id, kind,
                 (COALESCE(post_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    DO UPDATE
        SET contact_name     = COALESCE(EXCLUDED.contact_name, public.messenger_chats.contact_name),
            contact_username = COALESCE(EXCLUDED.contact_username, public.messenger_chats.contact_username),
            avatar_uri       = COALESCE(EXCLUDED.avatar_uri, public.messenger_chats.avatar_uri),
            updated_at       = now()
    RETURNING id, client_id INTO v_chat, v_client;

    -- Карточка клиента — только для Direct одного человека (у групп
    -- identity_kind пустой). Комментаторы карточек не получают.
    IF v_kind = 'direct' AND v_client IS NULL AND COALESCE(p_msg ->> 'identity_kind', '') <> '' THEN
        v_client := public.messenger_find_or_create_client(
            p_provider,
            p_msg ->> 'identity_kind',
            v_chat_key,
            COALESCE(NULLIF(p_msg #>> '{contact,name}', ''), p_msg #>> '{contact,username}'));
        IF v_client IS NOT NULL THEN
            UPDATE public.messenger_chats SET client_id = v_client
             WHERE id = v_chat AND client_id IS NULL;
        END IF;
    END IF;

    -- Итоговый статус нашего сообщения: свой, отложенный (пришёл раньше
    -- сообщения) и «не ушло» из очереди — берём сильнейший.
    IF v_dir = 'out' THEN
        SELECT ps.status, ps.error INTO v_pending
          FROM public.messenger_pending_statuses AS ps
         WHERE ps.provider = p_provider AND ps.external_id = v_ext;
        IF FOUND AND public.messenger_status_rank(v_pending.status) >= public.messenger_status_rank(v_status) THEN
            v_status := v_pending.status;
            v_error  := COALESCE(v_pending.error, v_error);
        END IF;
        SELECT o.error INTO v_pending
          FROM public.messenger_outbox AS o
         WHERE o.external_message_id = v_ext AND o.status = 'failed'
         LIMIT 1;
        IF FOUND THEN
            v_status := 'error';
            v_error  := COALESCE(v_error, v_pending.error);
        END IF;
    END IF;

    INSERT INTO public.messenger_messages (
        provider, external_id, chat_id, direction, is_echo, sent_from_app, author_name, type,
        text, content_uri, status, error, quoted_external_id, is_edited, is_deleted, sent_at, raw)
    VALUES (
        p_provider, v_ext, v_chat, v_dir,
        COALESCE((p_msg ->> 'is_echo')::boolean, false),
        v_from_app,
        p_msg ->> 'author_name',
        p_msg ->> 'type',
        CASE WHEN v_deleted THEN NULL ELSE p_msg ->> 'text' END,
        CASE WHEN v_deleted THEN NULL ELSE p_msg ->> 'content_uri' END,
        v_status,
        v_error,
        p_msg ->> 'quoted_external_id',
        COALESCE((p_msg ->> 'is_edited')::boolean, false),
        v_deleted,
        v_sent,
        CASE WHEN v_deleted THEN NULL ELSE p_msg -> 'raw' END)
    ON CONFLICT (provider, external_id) DO UPDATE
        -- Текст меняет только правка: повтор старого события не откатит
        -- отредактированный текст назад. Удалённое стирается и не воскресает.
        SET text = CASE
                WHEN EXCLUDED.is_deleted OR public.messenger_messages.is_deleted THEN NULL
                WHEN EXCLUDED.is_edited OR public.messenger_messages.text IS NULL
                    THEN COALESCE(EXCLUDED.text, public.messenger_messages.text)
                ELSE public.messenger_messages.text END,
            content_uri = CASE
                WHEN EXCLUDED.is_deleted OR public.messenger_messages.is_deleted THEN NULL
                ELSE COALESCE(EXCLUDED.content_uri, public.messenger_messages.content_uri) END,
            status = CASE WHEN public.messenger_status_rank(EXCLUDED.status)
                               >= public.messenger_status_rank(public.messenger_messages.status)
                          THEN COALESCE(EXCLUDED.status, public.messenger_messages.status)
                          ELSE public.messenger_messages.status END,
            error = COALESCE(EXCLUDED.error, public.messenger_messages.error),
            is_edited = public.messenger_messages.is_edited OR EXCLUDED.is_edited,
            is_deleted = public.messenger_messages.is_deleted OR EXCLUDED.is_deleted,
            raw = CASE WHEN EXCLUDED.is_deleted OR public.messenger_messages.is_deleted THEN NULL
                       ELSE EXCLUDED.raw END,
            updated_at = now()
    RETURNING id, (xmax = 0), COALESCE(status = 'error', false) INTO v_msg, v_inserted, v_failed;

    DELETE FROM public.messenger_pending_statuses
     WHERE provider = p_provider AND external_id = v_ext;

    IF v_dir = 'out' THEN
        -- Эхо нашего ответа: связываем с очередью, дубля не создаём.
        -- Эхо с ошибкой — отправка «не ушла», даже если Wazzup её принял.
        UPDATE public.messenger_outbox
           SET status = CASE WHEN v_failed THEN 'failed' ELSE 'sent' END,
               error = CASE WHEN v_failed THEN COALESCE(v_error, 'Wazzup сообщил об ошибке доставки') ELSE NULL END,
               sent_at = CASE WHEN v_failed THEN sent_at ELSE COALESCE(sent_at, v_sent) END,
               updated_at = now()
         WHERE external_message_id = v_ext
           AND (status IN ('pending', 'unknown') OR (v_failed AND status = 'sent'));

        -- Ответ Wazzup потерялся (обрыв связи), а эхо пришло: ищем нашу
        -- неподтверждённую отправку в этом же чате с тем же текстом за 15 минут.
        IF NOT v_from_app
           AND public.messenger_norm_text(p_msg ->> 'text') <> ''
           AND NOT EXISTS (SELECT 1 FROM public.messenger_outbox WHERE external_message_id = v_ext) THEN
            UPDATE public.messenger_outbox AS o
               SET status = CASE WHEN v_failed THEN 'failed' ELSE 'sent' END,
                   external_message_id = v_ext,
                   error = CASE WHEN v_failed THEN COALESCE(v_error, 'Wazzup сообщил об ошибке доставки') ELSE NULL END,
                   sent_at = CASE WHEN v_failed THEN o.sent_at ELSE COALESCE(o.sent_at, v_sent) END,
                   updated_at = now()
             WHERE o.id = (
                   SELECT x.id
                     FROM public.messenger_outbox AS x
                    WHERE x.chat_id = v_chat
                      AND x.status = 'unknown'
                      AND x.external_message_id IS NULL
                      AND public.messenger_norm_text(x.text) = public.messenger_norm_text(p_msg ->> 'text')
                      AND x.created_at BETWEEN v_sent - interval '15 minutes' AND v_sent + interval '15 minutes'
                    ORDER BY x.created_at
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED);
        END IF;

        FOR v_outchat IN
            SELECT DISTINCT o.chat_id FROM public.messenger_outbox AS o
             WHERE o.external_message_id = v_ext AND o.chat_id <> v_chat
        LOOP
            PERFORM public.messenger_refresh_chat(v_outchat);
        END LOOP;
    END IF;

    PERFORM public.messenger_refresh_chat(v_chat);

    RETURN jsonb_build_object('chat_id', v_chat, 'message_id', v_msg, 'client_id', v_client,
                              'inserted', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.messenger_ingest_message(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.messenger_ingest_message(text, jsonb) TO service_role;

/**
 * Статус доставки нашего сообщения. Только вперёд (см. messenger_status_rank);
 * 'edited' — отметка правки, не статус. Ошибка доставки переводит отправку
 * в очереди в «не ушло», даже если Wazzup сначала её принял. Сообщения ещё
 * нет — статус откладывается и применится при его приёме.
 */
CREATE OR REPLACE FUNCTION public.messenger_apply_status(
    p_provider    text,
    p_external_id text,
    p_status      text,
    p_error       text,
    p_at          timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_status text := lower(COALESCE(p_status, ''));
    v_chat   uuid;
    v_msgs   integer := 0;
    v_outs   integer := 0;
BEGIN
    IF COALESCE(p_external_id, '') = '' OR v_status = '' THEN
        RETURN 0;
    END IF;

    IF v_status = 'edited' THEN
        UPDATE public.messenger_messages
           SET is_edited = true, updated_at = now()
         WHERE provider = p_provider AND external_id = p_external_id;
        GET DIAGNOSTICS v_msgs = ROW_COUNT;

        RETURN v_msgs;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.messenger_messages
                    WHERE provider = p_provider AND external_id = p_external_id) THEN
        INSERT INTO public.messenger_pending_statuses (provider, external_id, status, error, status_at)
        VALUES (p_provider, p_external_id, v_status, p_error, p_at)
        ON CONFLICT (provider, external_id) DO UPDATE
            SET status = CASE WHEN public.messenger_status_rank(EXCLUDED.status)
                                   >= public.messenger_status_rank(public.messenger_pending_statuses.status)
                              THEN EXCLUDED.status ELSE public.messenger_pending_statuses.status END,
                error = COALESCE(EXCLUDED.error, public.messenger_pending_statuses.error),
                status_at = COALESCE(EXCLUDED.status_at, public.messenger_pending_statuses.status_at),
                received_at = now();
    END IF;

    UPDATE public.messenger_messages AS m
       SET status = v_status,
           error = CASE WHEN v_status = 'error' THEN COALESCE(p_error, m.error) ELSE m.error END,
           updated_at = now()
     WHERE m.provider = p_provider
       AND m.external_id = p_external_id
       AND m.direction = 'out'
       AND public.messenger_status_rank(v_status) >= public.messenger_status_rank(m.status)
    RETURNING m.chat_id INTO v_chat;
    GET DIAGNOSTICS v_msgs = ROW_COUNT;

    UPDATE public.messenger_outbox AS o
       SET status = CASE WHEN v_status = 'error' THEN 'failed' ELSE 'sent' END,
           error = CASE WHEN v_status = 'error'
                        THEN COALESCE(p_error, 'Wazzup сообщил об ошибке доставки') ELSE NULL END,
           sent_at = CASE WHEN v_status = 'error' THEN o.sent_at ELSE COALESCE(o.sent_at, p_at, now()) END,
           updated_at = now()
     WHERE o.external_message_id = p_external_id
       AND o.chat_id IN (SELECT c.id FROM public.messenger_chats AS c WHERE c.provider = p_provider)
       AND (o.status IN ('pending', 'unknown') OR (v_status = 'error' AND o.status = 'sent'));
    GET DIAGNOSTICS v_outs = ROW_COUNT;

    IF v_chat IS NOT NULL THEN
        PERFORM public.messenger_refresh_chat(v_chat);
    END IF;
    FOR v_chat IN
        SELECT DISTINCT o.chat_id FROM public.messenger_outbox AS o WHERE o.external_message_id = p_external_id
    LOOP
        PERFORM public.messenger_refresh_chat(v_chat);
    END LOOP;

    RETURN v_msgs + v_outs;
END;
$$;

REVOKE ALL ON FUNCTION public.messenger_apply_status(text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.messenger_apply_status(text, text, text, text, timestamptz) TO service_role;

/**
 * Разбор пачки из одного события одним обращением к базе: сообщения,
 * статусы, состояния каналов. Каждое сообщение — в своей подтранзакции:
 * одно кривое не откатывает остальные. Сообщения неизвестных каналов не
 * пишутся (карточки не заводятся) и возвращаются списком — событие останется
 * неразобранным и переразберётся, когда setup добавит канал.
 */
CREATE OR REPLACE FUNCTION public.messenger_ingest_batch(
    p_provider text,
    p_messages jsonb,
    p_statuses jsonb,
    p_channels jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_item     jsonb;
    v_messages integer := 0;
    v_statuses integer := 0;
    v_channels integer := 0;
    v_errors   jsonb := '[]'::jsonb;
    v_unknown  jsonb := '[]'::jsonb;
    v_skipped  jsonb := '[]'::jsonb;
    v_rows     integer;
BEGIN
    FOR v_item IN SELECT value FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p_messages) = 'array' THEN p_messages ELSE '[]'::jsonb END)
    LOOP
        BEGIN
            PERFORM public.messenger_ingest_message(p_provider, v_item);
            v_messages := v_messages + 1;
        EXCEPTION
            WHEN no_data_found THEN
                IF NOT v_unknown @> jsonb_build_array(v_item ->> 'channel_external_id') THEN
                    v_unknown := v_unknown || jsonb_build_array(v_item ->> 'channel_external_id');
                END IF;
            WHEN OTHERS THEN
                v_errors := v_errors || jsonb_build_array(
                    left(format('%s: %s', v_item ->> 'external_id', SQLERRM), 300));
        END;
    END LOOP;

    FOR v_item IN SELECT value FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p_statuses) = 'array' THEN p_statuses ELSE '[]'::jsonb END)
    LOOP
        BEGIN
            PERFORM public.messenger_apply_status(p_provider, v_item ->> 'external_id', v_item ->> 'status',
                                                  v_item ->> 'error', (v_item ->> 'at')::timestamptz);
            v_statuses := v_statuses + 1;
        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors || jsonb_build_array(
                left(format('статус %s: %s', v_item ->> 'external_id', SQLERRM), 300));
        END;
    END LOOP;

    -- Только состояние и только известных каналов: вебхук не присылает
    -- transport и plainId, а чужой канал заводить нельзя.
    FOR v_item IN SELECT value FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p_channels) = 'array' THEN p_channels ELSE '[]'::jsonb END)
    LOOP
        UPDATE public.messenger_channels
           SET state = COALESCE(v_item ->> 'state', state), updated_at = now()
         WHERE provider = p_provider AND external_id = v_item ->> 'external_id';
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            v_channels := v_channels + 1;
        ELSE
            v_skipped := v_skipped || jsonb_build_array(v_item ->> 'external_id');
        END IF;
    END LOOP;

    RETURN jsonb_build_object('messages', v_messages, 'statuses', v_statuses, 'channels', v_channels,
                              'errors', v_errors, 'unknown_channels', v_unknown,
                              'skipped_channels', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.messenger_ingest_batch(text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.messenger_ingest_batch(text, jsonb, jsonb, jsonb) TO service_role;

/**
 * Выдать события на повторный разбор — как oko_events_to_retry: каждая
 * выдача увеличивает счётчик и отодвигает следующую попытку (1, 5, 25 минут…),
 * после десяти попыток событие ждёт человека. Первую попытку даём не раньше
 * чем через 2 минуты после приёма: вебхук может ещё разбирать его сам.
 * Заодно убираем отложенные статусы старше недели — их сообщение не придёт.
 */
CREATE OR REPLACE FUNCTION public.messenger_events_to_retry(p_limit integer DEFAULT 20)
RETURNS TABLE (event_id bigint, event_provider text, event_payload jsonb, event_attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM public.messenger_pending_statuses WHERE received_at < now() - interval '7 days';

    RETURN QUERY
    WITH picked AS (
        SELECT e.id
          FROM public.messenger_events AS e
         WHERE e.processed_at IS NULL
           AND e.attempts < 10
           AND (e.attempts > 0 OR e.received_at < now() - interval '2 minutes')
           AND COALESCE(e.next_try_at, e.received_at) <= now()
         ORDER BY COALESCE(e.next_try_at, e.received_at)
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100))
         FOR UPDATE SKIP LOCKED
    )
    UPDATE public.messenger_events AS e
       SET attempts = e.attempts + 1,
           next_try_at = now() + make_interval(mins => LEAST(power(5, e.attempts)::int, 1440))
      FROM picked
     WHERE e.id = picked.id
    RETURNING e.id, e.provider, e.payload, e.attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.messenger_events_to_retry(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.messenger_events_to_retry(integer) TO service_role;

/**
 * Не успели разобрать за отведённое время — вернуть событие в очередь,
 * не засчитывая попытку: это не сбой, а нехватка времени у запроса.
 */
CREATE OR REPLACE FUNCTION public.messenger_event_defer(p_id bigint)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE public.messenger_events
       SET attempts = GREATEST(attempts - 1, 0),
           next_try_at = now() + interval '1 minute',
           error = 'не успели разобрать за отведённое время — доразберём'
     WHERE id = p_id AND processed_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.messenger_event_defer(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.messenger_event_defer(bigint) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Список для экрана (только admin)
-- ─────────────────────────────────────────────────────────────────────────

/**
 * Чаты с последним сообщением. waiting_since — первое входящее после нашего
 * последнего ответа (ответили — пусто). Для комментариев — пост и номер
 * последнего комментария: на него уходит ответ, от него считаются 7 дней
 * приватного ответа, и по нему видно, был ли приватный ответ уже.
 */
CREATE OR REPLACE FUNCTION public.messenger_chat_list(
    p_chat_type text DEFAULT 'instagram',
    p_kind      text DEFAULT NULL,
    p_limit     integer DEFAULT 300
)
RETURNS TABLE (
    chat_id                  uuid,
    kind                     text,
    chat_type                text,
    channel_external_id      text,
    external_chat_id         text,
    contact_name             text,
    contact_username         text,
    avatar_uri               text,
    client_id                uuid,
    client_name              text,
    is_provisional           boolean,
    last_inbound_at          timestamptz,
    last_message_at          timestamptz,
    waiting_since            timestamptz,
    last_text                text,
    last_direction           text,
    last_type                text,
    last_inbound_external_id text,
    post_id                  uuid,
    post_external_id         text,
    post_src                 text,
    post_description         text,
    post_author              text,
    private_reply_used       boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
    IF COALESCE(public.current_app_role(), '') <> 'admin' THEN
        RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT c.id,
           c.kind,
           c.chat_type,
           c.channel_external_id,
           c.chat_id,
           c.contact_name,
           c.contact_username,
           c.avatar_uri,
           c.client_id,
           cl.name,
           COALESCE(cl.is_provisional, false),
           c.last_inbound_at,
           c.last_message_at,
           c.first_unanswered_at,
           left(COALESCE(lm.text, ''), 300),
           lm.direction,
           lm.type,
           li.external_id,
           p.id,
           p.external_id,
           p.src,
           left(p.description, 500),
           p.author,
           EXISTS (
               SELECT 1 FROM public.messenger_outbox AS o
                WHERE o.chat_id = c.id
                  AND o.mode = 'comment_private'
                  AND o.status <> 'failed'
                  AND o.ref_external_id = li.external_id)
      FROM public.messenger_chats AS c
      LEFT JOIN public.clients AS cl ON cl.id = c.client_id
      LEFT JOIN public.messenger_posts AS p ON p.id = c.post_id
      LEFT JOIN LATERAL (
            SELECT m.text, m.direction, m.type
              FROM public.messenger_messages AS m
             WHERE m.chat_id = c.id
             ORDER BY m.sent_at DESC, m.id DESC
             LIMIT 1
      ) AS lm ON true
      LEFT JOIN LATERAL (
            SELECT m.external_id
              FROM public.messenger_messages AS m
             WHERE m.chat_id = c.id AND m.direction = 'in' AND NOT m.is_deleted
             ORDER BY m.sent_at DESC, m.id DESC
             LIMIT 1
      ) AS li ON true
     WHERE (p_chat_type IS NULL OR c.chat_type = p_chat_type)
       AND (p_kind IS NULL OR c.kind = p_kind)
     ORDER BY c.last_message_at DESC NULLS LAST
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 300), 1000));
END;
$$;

REVOKE ALL ON FUNCTION public.messenger_chat_list(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messenger_chat_list(text, text, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Сведение карточек переносит и привязки к мессенджерам
-- ─────────────────────────────────────────────────────────────────────────

-- Тело — из 20260914090000_reliability_db.sql без изменений, кроме блока
-- «Мессенджеры» перед удалением карточки. Без него удаление упёрлось бы в
-- RESTRICT client_identities, а раньше — молча оторвало бы Instagram.
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

    -- Мессенджеры (15.09.2026): привязки к нику и чаты переезжают к получателю,
    -- следующее сообщение пойдёт в его карточку. Конфликт — строка уже у
    -- получателя: пропускаем и удаляем у источника, чтобы удаление карточки
    -- не упёрлось в RESTRICT. (У messenger_outbox своего client_id нет.)
    UPDATE public.client_identities AS i
       SET client_id = p_into
     WHERE i.client_id = p_from
       AND NOT EXISTS (
           SELECT 1 FROM public.client_identities AS x
            WHERE x.provider = i.provider AND x.kind = i.kind
              AND x.external_key = i.external_key AND x.client_id = p_into);
    DELETE FROM public.client_identities WHERE client_id = p_from;
    UPDATE public.messenger_chats SET client_id = p_into, updated_at = now() WHERE client_id = p_from;

    DELETE FROM public.clients WHERE id = p_from;

    -- Массивы получателя приводим в согласие с привязками.
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
               ) AS x)
     WHERE c.id = p_into;

    RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.oko_merge_clients_unchecked(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oko_merge_clients_unchecked(uuid, uuid) TO service_role;

COMMIT;
