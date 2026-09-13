-- Проверка схемы мессенджеров (Instagram через Wazzup) на чистом Postgres (15.09.2026).
--
-- Функции разбора, уникальные ключи, «ждёт ответа», сведение карточек и права
-- живут в базе — обычными тестами их не проверить. Файл создаёт заглушки,
-- накатывает миграцию и прогоняет сценарии. Провал — «ОШИБКА ТЕСТА».
--
-- Запуск (из корня репозитория; в CI — .github/workflows/db-checks.yml):
--   createdb msg_check
--   psql -q -v ON_ERROR_STOP=1 -d msg_check -f scripts/checks/messenger.sql
--   dropdb msg_check
\set ON_ERROR_STOP on

-- Заглушки того, что уже есть в рабочей базе (столбцы, нужные миграции и сведению).
CREATE TABLE public.clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    oko_contact_id bigint UNIQUE, name text, note text,
    phones text[] NOT NULL DEFAULT '{}', emails text[] NOT NULL DEFAULT '{}',
    telegram_user_id text,
    oko_messenger_ids bigint[] NOT NULL DEFAULT '{}', oko_client_ids bigint[] NOT NULL DEFAULT '{}',
    last_incoming_at timestamptz,
    is_provisional boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.deals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL
);
CREATE TABLE public.deal_messages (
    id bigserial PRIMARY KEY,
    client_id uuid REFERENCES public.clients (id) ON DELETE CASCADE
);
CREATE TABLE public.oko_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL
);
CREATE TABLE public.client_external_ids (
    provider text NOT NULL DEFAULT 'oko', kind text NOT NULL, external_id bigint NOT NULL,
    client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
    PRIMARY KEY (provider, kind, external_id)
);
CREATE FUNCTION public.current_app_role() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT current_setting('app.role', true) $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;

\i supabase/migrations/20260915090000_messenger_wazzup.sql

-- Канал заводит setup; без него сообщения не принимаются.
INSERT INTO public.messenger_channels (provider, external_id, transport, plain_id, state)
VALUES ('wazzup', 'ch-1', 'instagram', 'abhazbereg', 'active'),
       -- WhatsApp в аккаунте есть, но пока идёт через ОКО — не принимается.
       ('wazzup', 'ch-wa', 'whatsapp', '79001234567', 'active');

-- Сообщение в том виде, в каком его отдаёт normalize.ts. identity_kind
-- передаём и для комментариев — база сама не должна заводить по ним карточку.
CREATE FUNCTION public.t_msg(
    p_ext text, p_chat text, p_dir text, p_at text, p_text text,
    p_post text DEFAULT NULL, p_status text DEFAULT NULL,
    p_edited boolean DEFAULT false, p_from_app boolean DEFAULT false,
    p_deleted boolean DEFAULT false, p_channel text DEFAULT 'ch-1'
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'external_id', p_ext, 'channel_external_id', p_channel, 'chat_type', 'instagram', 'chat_id', p_chat,
    'kind', CASE WHEN p_post IS NULL THEN 'direct' ELSE 'comment' END,
    'post', CASE WHEN p_post IS NULL THEN NULL ELSE jsonb_build_object(
              'external_id', p_post, 'src', 'https://www.instagram.com/p/' || p_post || '/',
              'description', 'Пост ' || p_post) END,
    'identity_kind', 'instagram',
    'contact', jsonb_build_object('name', 'Анна', 'username', p_chat),
    'direction', p_dir, 'is_echo', p_dir = 'out', 'sent_from_app', p_from_app,
    'type', 'text', 'text', p_text,
    'status', COALESCE(p_status, CASE WHEN p_dir = 'in' THEN 'inbound' ELSE 'sent' END),
    'is_edited', p_edited, 'is_deleted', p_deleted, 'sent_at', p_at,
    'raw', jsonb_build_object('messageId', p_ext, 'text', p_text)))
$$;

CREATE FUNCTION public.t_waiting(p_chat text) RETURNS timestamptz LANGUAGE sql AS $$
  SELECT first_unanswered_at FROM public.messenger_chats WHERE chat_id = lower(p_chat) AND kind = 'direct'
$$;

CREATE FUNCTION public.t_direct_chat(p_chat text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.messenger_chats WHERE chat_id = lower(p_chat) AND kind = 'direct'
$$;

\echo '=== 1. первое сообщение заводит чат и временного клиента; повтор безвреден ==='
SELECT public.messenger_ingest_message('wazzup', public.t_msg('d1', 'anna.travel', 'in', '2026-09-13T10:00:00Z', 'Здравствуйте'));
SELECT public.messenger_ingest_message('wazzup', public.t_msg('d1', 'anna.travel', 'in', '2026-09-13T10:00:00Z', 'Здравствуйте'));
DO $$
DECLARE n_msg int; n_chat int; n_cl int; v_note text; v_prov boolean;
BEGIN
  SELECT count(*) INTO n_msg FROM public.messenger_messages;
  SELECT count(*) INTO n_chat FROM public.messenger_chats;
  SELECT count(*), max(note), bool_and(is_provisional) INTO n_cl, v_note, v_prov FROM public.clients;
  IF n_msg <> 1 OR n_chat <> 1 OR n_cl <> 1 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: сообщений %, чатов %, клиентов % (ждали по одному)', n_msg, n_chat, n_cl;
  END IF;
  IF v_note <> 'Заведён по сообщению из Instagram' OR NOT v_prov THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: карточка не временная или без заметки (%)', v_note;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.messenger_chats WHERE client_id IS NOT NULL) THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: чат не привязан к клиенту';
  END IF;
  RAISE NOTICE 'один чат, одно сообщение, один временный клиент';
END $$;

\echo '=== 2. Anna.Travel и @anna.travel — тот же чат и тот же клиент ==='
SELECT public.messenger_ingest_message('wazzup', public.t_msg('d-case', 'Anna.Travel', 'in', '2026-09-13T09:00:00Z', 'привет'));
SELECT public.messenger_ingest_message('wazzup', public.t_msg('d-at', '@anna.travel', 'in', '2026-09-13T09:01:00Z', 'алло'));
DO $$
DECLARE n_chats int; n_clients int;
BEGIN
  SELECT count(*) INTO n_chats FROM public.messenger_chats WHERE kind = 'direct';
  IF n_chats <> 1 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: Direct-чатов % (ждали 1: регистр и @ не важны)', n_chats; END IF;
  SELECT count(*) INTO n_clients FROM public.clients;
  IF n_clients <> 1 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: клиентов % (ждали 1)', n_clients; END IF;
  IF public.messenger_find_or_create_client('wazzup', 'instagram', '@ANNA.travel', 'x')
     IS DISTINCT FROM (SELECT client_id FROM public.messenger_chats LIMIT 1) THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: @ANNA.travel — другой клиент';
  END IF;
  IF public.messenger_find_or_create_client('wazzup', 'instagram', '  ', 'x') IS NOT NULL THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: пустой ник завёл клиента';
  END IF;
  RAISE NOTICE 'регистр и @ не плодят ни чатов, ни клиентов';
END $$;

\echo '=== 3. «ждёт ответа» — первое входящее после нашего ответа, в любом порядке событий ==='
SELECT public.messenger_ingest_message('wazzup', public.t_msg('d2', 'anna.travel', 'in', '2026-09-13T10:05:00Z', 'Есть номера?'));
DO $$ BEGIN
  IF public.t_waiting('anna.travel') <> '2026-09-13T09:00:00Z' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: ждёт с % (ждали 09:00)', public.t_waiting('anna.travel');
  END IF;
END $$;
SELECT public.messenger_ingest_message('wazzup', public.t_msg('d3', 'anna.travel', 'out', '2026-09-13T10:10:00Z', 'Есть!', NULL, NULL, false, true));
-- Запоздавшее входящее, написанное ДО нашего ответа, ожидание не включает.
SELECT public.messenger_ingest_message('wazzup', public.t_msg('d0', 'anna.travel', 'in', '2026-09-13T09:55:00Z', 'Алло'));
DO $$ BEGIN
  IF public.t_waiting('anna.travel') IS NOT NULL THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: после ответа всё ещё ждёт (%)', public.t_waiting('anna.travel');
  END IF;
END $$;
SELECT public.messenger_ingest_message('wazzup', public.t_msg('d4', 'anna.travel', 'in', '2026-09-13T11:00:00Z', 'А на 5 человек?'));
-- Наше сообщение с ошибкой доставки ответом не считается.
SELECT public.messenger_ingest_message('wazzup', public.t_msg('d5', 'anna.travel', 'out', '2026-09-13T11:30:00Z', 'Да', NULL, 'error'));
DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM public.messenger_chats WHERE chat_id = 'anna.travel' AND kind = 'direct';
  IF c.first_unanswered_at <> '2026-09-13T11:00:00Z' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: ждёт с % (ждали 11:00)', c.first_unanswered_at;
  END IF;
  IF c.last_inbound_at <> '2026-09-13T11:00:00Z' OR c.last_message_at <> '2026-09-13T11:30:00Z' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: отметки чата % / %', c.last_inbound_at, c.last_message_at;
  END IF;
  RAISE NOTICE 'ожидание считается верно, порядок событий не важен';
END $$;

\echo '=== 4. «доставлено» раньше эха не теряется; эхо не создаёт дубль; статусы только вперёд ==='
INSERT INTO public.messenger_outbox (id, chat_id, mode, text, status, external_message_id, created_by)
VALUES ('30000000-0000-0000-0000-000000000001', public.t_direct_chat('anna.travel'), 'direct',
        'Да, на пятерых есть', 'pending', 'o-1', 'Дарья');
SELECT public.messenger_apply_status('wazzup', 'o-1', 'delivered', NULL, '2026-09-13T11:41:00Z') AS статус_до_эха;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.messenger_pending_statuses WHERE external_id = 'o-1' AND status = 'delivered') THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: статус до эха не отложен';
  END IF;
END $$;
SELECT public.messenger_ingest_message('wazzup', public.t_msg('o-1', 'anna.travel', 'out', '2026-09-13T11:40:00Z', 'Да, на пятерых есть'));
DO $$ BEGIN
  IF (SELECT status FROM public.messenger_messages WHERE external_id = 'o-1') <> 'delivered' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: отложенный статус не применился';
  END IF;
  IF EXISTS (SELECT 1 FROM public.messenger_pending_statuses WHERE external_id = 'o-1') THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: отложенный статус не убран';
  END IF;
END $$;
SELECT public.messenger_apply_status('wazzup', 'o-1', 'read', NULL, now());
SELECT public.messenger_apply_status('wazzup', 'o-1', 'delivered', NULL, now());
SELECT public.messenger_apply_status('wazzup', 'o-1', 'edited', NULL, now());
DO $$
DECLARE v_status text; v_out text; n int; v_edited boolean;
BEGIN
  SELECT status, is_edited INTO v_status, v_edited FROM public.messenger_messages WHERE external_id = 'o-1';
  SELECT status INTO v_out FROM public.messenger_outbox WHERE external_message_id = 'o-1';
  SELECT count(*) INTO n FROM public.messenger_messages WHERE text = 'Да, на пятерых есть';
  IF v_status <> 'read' THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: статус откатился: %', v_status; END IF;
  IF NOT v_edited THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: правка не отмечена'; END IF;
  IF v_out <> 'sent' THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: очередь не отмечена отправленной: %', v_out; END IF;
  IF n <> 1 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: сообщений с этим текстом %', n; END IF;
  IF public.t_waiting('anna.travel') IS NOT NULL THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: после отправки чат всё ещё ждёт';
  END IF;
  RAISE NOTICE 'статус «прочитано» не откатился, дубля нет, чат отвечен';
END $$;

\echo '=== 5. ошибка доставки после «прочитано»: очередь «не ушло», чат снова ждёт ==='
SELECT public.messenger_apply_status('wazzup', 'o-1', 'error', 'MESSAGES_IS_SPAM', now());
DO $$
DECLARE v_out text; v_err text;
BEGIN
  SELECT status, error INTO v_out, v_err FROM public.messenger_outbox WHERE external_message_id = 'o-1';
  IF v_out <> 'failed' OR v_err <> 'MESSAGES_IS_SPAM' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: очередь % / %', v_out, v_err;
  END IF;
  IF public.t_waiting('anna.travel') <> '2026-09-13T11:00:00Z' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: недоставленное считается ответом (%)', public.t_waiting('anna.travel');
  END IF;
  RAISE NOTICE 'недоставленное — не ответ';
END $$;

\echo '=== 6. эхо пришло сразу со status error: очередь failed, сообщение error, чат ждёт ==='
INSERT INTO public.messenger_outbox (id, chat_id, mode, text, status, external_message_id)
VALUES ('30000000-0000-0000-0000-000000000006', public.t_direct_chat('anna.travel'), 'direct', 'Ответ', 'pending', 'o-6');
SELECT public.messenger_ingest_message('wazzup', public.t_msg('o-6', 'anna.travel', 'out', '2026-09-13T12:00:00Z', 'Ответ', NULL, 'error'));
DO $$
DECLARE v_msg text; v_out text;
BEGIN
  SELECT status INTO v_msg FROM public.messenger_messages WHERE external_id = 'o-6';
  SELECT status INTO v_out FROM public.messenger_outbox WHERE external_message_id = 'o-6';
  IF v_msg <> 'error' OR v_out <> 'failed' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: эхо с ошибкой: сообщение %, очередь %', v_msg, v_out;
  END IF;
  IF public.t_waiting('anna.travel') <> '2026-09-13T11:00:00Z' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: эхо с ошибкой сочтено ответом (%)', public.t_waiting('anna.travel');
  END IF;
  RAISE NOTICE 'эхо с ошибкой — не ответ';
END $$;

\echo '=== 7. status error пришёл РАНЬШЕ эха: ошибка не теряется ==='
-- а) отправка из нашей программы: строка очереди есть.
INSERT INTO public.messenger_outbox (id, chat_id, mode, text, status, external_message_id)
VALUES ('30000000-0000-0000-0000-000000000007', public.t_direct_chat('anna.travel'), 'direct', 'Второй ответ', 'pending', 'o-7');
SELECT public.messenger_apply_status('wazzup', 'o-7', 'error', 'CHANNEL_UNAVAILABLE', now());
SELECT public.messenger_ingest_message('wazzup', public.t_msg('o-7', 'anna.travel', 'out', '2026-09-13T12:10:00Z', 'Второй ответ'));
-- б) ответ из родного чата Wazzup: строки очереди нет, выручает отложенный статус.
SELECT public.messenger_apply_status('wazzup', 'o-8', 'error', 'MESSAGES_IS_SPAM', now());
SELECT public.messenger_ingest_message('wazzup', public.t_msg('o-8', 'anna.travel', 'out', '2026-09-13T12:20:00Z', 'Из Wazzup', NULL, 'sent', false, true));
DO $$
DECLARE v7 text; v7out text; v8 text; v8err text;
BEGIN
  SELECT status INTO v7 FROM public.messenger_messages WHERE external_id = 'o-7';
  SELECT status INTO v7out FROM public.messenger_outbox WHERE external_message_id = 'o-7';
  SELECT status, error INTO v8, v8err FROM public.messenger_messages WHERE external_id = 'o-8';
  IF v7 <> 'error' OR v7out <> 'failed' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: ошибка до эха (очередь): сообщение %, очередь %', v7, v7out;
  END IF;
  IF v8 <> 'error' OR v8err <> 'MESSAGES_IS_SPAM' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: ошибка до эха (без очереди): % / %', v8, v8err;
  END IF;
  IF public.t_waiting('anna.travel') <> '2026-09-13T11:00:00Z' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: недоставленные ответы сочтены ответом (%)', public.t_waiting('anna.travel');
  END IF;
  IF EXISTS (SELECT 1 FROM public.messenger_pending_statuses) THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: отложенные статусы не убраны';
  END IF;
  RAISE NOTICE 'ошибка, пришедшая раньше эха, применилась в обоих случаях';
END $$;

\echo '=== 8. связь оборвалась (unknown), но эхо пришло — подтверждение по тексту ==='
INSERT INTO public.messenger_outbox (id, chat_id, mode, text, status)
VALUES ('30000000-0000-0000-0000-000000000002', public.t_direct_chat('anna.travel'), 'direct', 'Уточните даты', 'unknown'),
       ('30000000-0000-0000-0000-000000000009', public.t_direct_chat('anna.travel'), 'direct', 'Проверка', 'pending');
-- Переносы \r\n и пробелы по краям — та же нормализация, что на сервере.
SELECT public.messenger_ingest_message('wazzup', public.t_msg('o-2', 'anna.travel', 'out', now()::text, E'  Уточните даты\r\n'));
-- «Отправляется» (pending) по тексту не подтверждаем — только unknown.
SELECT public.messenger_ingest_message('wazzup', public.t_msg('o-9', 'anna.travel', 'out', now()::text, 'Проверка'));
DO $$
DECLARE r record; p record;
BEGIN
  SELECT status, external_message_id INTO r FROM public.messenger_outbox WHERE id = '30000000-0000-0000-0000-000000000002';
  IF r.status <> 'sent' OR r.external_message_id <> 'o-2' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: неизвестная отправка не подтвердилась: % / %', r.status, r.external_message_id;
  END IF;
  SELECT status, external_message_id INTO p FROM public.messenger_outbox WHERE id = '30000000-0000-0000-0000-000000000009';
  IF p.status <> 'pending' OR p.external_message_id IS NOT NULL THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: pending подтверждён по тексту: % / %', p.status, p.external_message_id;
  END IF;
  RAISE NOTICE 'неизвестная отправка подтверждена эхом, отправляющаяся не тронута';
END $$;

\echo '=== 9. комментарии: разные посты — разные чаты, карточек не заводят; правка не откатывается ==='
SELECT public.messenger_ingest_message('wazzup', public.t_msg('k1', 'kate', 'in', '2026-09-13T08:00:00Z', 'Сколько стоит?', 'P1'));
SELECT public.messenger_ingest_message('wazzup', public.t_msg('k2', 'Kate', 'in', '2026-09-13T08:10:00Z', 'А тут?', 'P2'));
SELECT public.messenger_ingest_message('wazzup', public.t_msg('k3', 'KATE', 'in', '2026-09-13T08:20:00Z', 'Ещё вопрос', 'P1'));
SELECT public.messenger_ingest_message('wazzup', public.t_msg('k3', 'kate', 'in', '2026-09-13T08:20:00Z', 'Ещё вопрос: есть ли парковка?', 'P1', NULL, true));
SELECT public.messenger_ingest_message('wazzup', public.t_msg('k3', 'kate', 'in', '2026-09-13T08:20:00Z', 'Ещё вопрос', 'P1'));
DO $$
DECLARE n_chats int; n_posts int; n_with_client int; n_clients int; v_text text;
BEGIN
  SELECT count(*) INTO n_chats FROM public.messenger_chats WHERE kind = 'comment';
  SELECT count(*) INTO n_posts FROM public.messenger_posts;
  SELECT count(*) INTO n_with_client FROM public.messenger_chats WHERE kind = 'comment' AND client_id IS NOT NULL;
  SELECT count(*) INTO n_clients FROM public.clients;
  SELECT text INTO v_text FROM public.messenger_messages WHERE external_id = 'k3';
  IF n_chats <> 2 OR n_posts <> 2 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: чатов комментариев %, постов % (kate/Kate/KATE — один автор)', n_chats, n_posts; END IF;
  IF n_with_client <> 0 OR n_clients <> 1 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: комментарии завели карточки (чатов с клиентом %, клиентов %)', n_with_client, n_clients;
  END IF;
  IF v_text <> 'Ещё вопрос: есть ли парковка?' THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: правка откатилась: %', v_text; END IF;
  RAISE NOTICE 'комментарии по постам раздельно, без карточек, правка на месте';
END $$;

\echo '=== 10. приватный ответ на комментарий: закрывает ожидание, второй — нельзя ==='
INSERT INTO public.messenger_outbox (chat_id, mode, ref_external_id, text, status, sent_at, external_message_id)
SELECT c.id, 'comment_private', 'k3', 'Написали вам в Direct', 'sent', now(), 'o-3'
  FROM public.messenger_chats c JOIN public.messenger_posts p ON p.id = c.post_id
 WHERE p.external_id = 'P1';
SELECT public.messenger_refresh_chat(c.id)
  FROM public.messenger_chats c JOIN public.messenger_posts p ON p.id = c.post_id WHERE p.external_id = 'P1';
DO $$ BEGIN
  INSERT INTO public.messenger_outbox (chat_id, mode, ref_external_id, text, status)
  SELECT c.id, 'comment_private', 'k3', 'Ещё раз в Direct', 'pending'
    FROM public.messenger_chats c JOIN public.messenger_posts p ON p.id = c.post_id WHERE p.external_id = 'P1';
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: второй приватный ответ на тот же комментарий принят';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'отказ, как и надо: один приватный ответ на комментарий';
END $$;
SET app.role = 'admin';
SELECT kind, external_chat_id, post_external_id, waiting_since IS NOT NULL AS ждёт, last_inbound_external_id, private_reply_used
  FROM public.messenger_chat_list('instagram', NULL, 50) ORDER BY kind, post_external_id NULLS FIRST;
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.messenger_chat_list('instagram', 'comment', 50) WHERE post_external_id = 'P1';
  IF r.waiting_since IS NOT NULL OR NOT r.private_reply_used OR r.last_inbound_external_id <> 'k3' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: P1 ждёт=%, приватный=%, последний=%', r.waiting_since, r.private_reply_used, r.last_inbound_external_id;
  END IF;
  IF r.post_src <> 'https://www.instagram.com/p/P1/' THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: нет ссылки на пост'; END IF;
  SELECT * INTO r FROM public.messenger_chat_list('instagram', 'comment', 50) WHERE post_external_id = 'P2';
  IF r.waiting_since IS NULL OR r.private_reply_used THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: P2 должен ждать ответа';
  END IF;
  IF (SELECT count(*) FROM public.messenger_chat_list('instagram', 'direct', 50)) <> 1 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: Direct-чатов в списке не 1';
  END IF;
  RAISE NOTICE 'список для экрана верный';
END $$;

\echo '=== 11. список и таблицы — только admin ==='
SET app.role = 'operator';
DO $$ BEGIN
  PERFORM public.messenger_chat_list();
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: оператор получил список';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'отказ, как и надо: оператору список не выдаётся';
END $$;
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.messenger_messages;
  IF n <> 0 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: оператор видит % сообщений', n; END IF;
  RAISE NOTICE 'оператор сообщений не видит';
END $$;
SET app.role = 'admin';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.messenger_messages;
  IF n = 0 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: admin не видит сообщений'; END IF;
  BEGIN
    INSERT INTO public.messenger_outbox (chat_id, mode, text) SELECT id, 'direct', 'подделка' FROM public.messenger_chats LIMIT 1;
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: из браузера можно записать в очередь';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'отказ, как и надо: писать может только сервер';
  END;
  BEGIN
    PERFORM public.messenger_ingest_message('wazzup', public.t_msg('fake', 'anna.travel', 'in', now()::text, 'x'));
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: из браузера можно вызвать разбор';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'отказ, как и надо: разбор только для сервера';
  END;
  RAISE NOTICE 'admin читает (% сообщений), но не пишет', n;
END $$;
RESET ROLE;

\echo '=== 12. сведение карточек переносит ник и чат; новая карточка не заводится ==='
INSERT INTO public.clients (id, oko_contact_id, name, phones)
VALUES ('a0000000-0000-0000-0000-000000000001', 100, 'Анна Петрова', ARRAY['+79001112233']);
DO $$
DECLARE
  v_real   constant uuid := 'a0000000-0000-0000-0000-000000000001';
  v_temp   uuid;
  v_before int;
  v_after  int;
BEGIN
  SELECT client_id INTO v_temp FROM public.messenger_chats WHERE chat_id = 'anna.travel' AND kind = 'direct';
  SELECT count(*) INTO v_before FROM public.clients;
  PERFORM public.oko_merge_clients_unchecked(v_temp, v_real);

  IF EXISTS (SELECT 1 FROM public.clients WHERE id = v_temp) THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: временная карточка осталась';
  END IF;
  IF (SELECT client_id FROM public.client_identities WHERE kind = 'instagram' AND external_key = 'anna.travel') <> v_real THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: привязка к нику не переехала';
  END IF;
  IF (SELECT client_id FROM public.messenger_chats WHERE chat_id = 'anna.travel' AND kind = 'direct') <> v_real THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: чат не переехал';
  END IF;

  PERFORM public.messenger_ingest_message('wazzup',
      public.t_msg('after-merge', 'Anna.Travel', 'in', '2026-09-13T13:00:00Z', 'Это снова я'));
  SELECT count(*) INTO v_after FROM public.clients;
  IF v_after <> v_before - 1 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: после сведения клиентов % (ждали %) — завелась новая карточка', v_after, v_before - 1;
  END IF;
  IF public.messenger_find_or_create_client('wazzup', 'instagram', 'anna.travel', 'x') <> v_real THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: ник ведёт не в карточку получателя';
  END IF;
  RAISE NOTICE 'сведение перенесло ник и чат, следующее сообщение пришло в карточку получателя';
END $$;
DO $$ BEGIN
  DELETE FROM public.clients WHERE id = 'a0000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: карточка с привязкой к Instagram удалилась мимо сведения';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'отказ, как и надо: удалить карточку с привязкой нельзя';
END $$;

\echo '=== 13. кривые данные, чужой канал, пачка, удалённое сообщение, группа ==='
DO $$ BEGIN
  PERFORM public.messenger_ingest_message('wazzup', public.t_msg('x1', 'anna.travel', 'in', now()::text, 'x') - 'chat_id');
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: сообщение без chat_id принято';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'ОШИБКА ТЕСТА%' THEN RAISE; END IF;
  RAISE NOTICE 'отказ, как и надо: %', left(SQLERRM, 60);
END $$;
DO $$ BEGIN
  PERFORM public.messenger_ingest_message('wazzup', jsonb_set(public.t_msg('x2', 'anna.travel', 'in', now()::text, 'x'), '{kind}', '"comment"'));
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: комментарий без поста принят';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'ОШИБКА ТЕСТА%' THEN RAISE; END IF;
  RAISE NOTICE 'отказ, как и надо: %', SQLERRM;
END $$;
DO $$ BEGIN
  INSERT INTO public.messenger_outbox (chat_id, mode, text)
  SELECT id, 'comment_public', 'без цитаты' FROM public.messenger_chats WHERE kind = 'comment' LIMIT 1;
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: ответ на комментарий без комментария принят';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'отказ, как и надо: ответ на комментарий требует комментарий';
END $$;
DO $$
DECLARE r jsonb; v_clients int;
BEGIN
  SELECT count(*) INTO v_clients FROM public.clients;
  -- Instagram, WhatsApp (канал ещё в ОКО) и неизвестный канал в одной пачке:
  -- Instagram пишется, остальное пропускается ПО ПРАВИЛУ — это не ошибки.
  r := public.messenger_ingest_batch('wazzup',
      jsonb_build_array(
          public.t_msg('b1', 'bob', 'in', now()::text, 'привет'),
          public.t_msg('b3', 'stranger', 'in', now()::text, 'спам', NULL, NULL, false, false, false, 'ch-x'),
          jsonb_set(public.t_msg('b4', '79005556677', 'in', now()::text, 'из WhatsApp', NULL, NULL, false, false, false, 'ch-wa'),
                    '{chat_type}', '"whatsapp"')),
      jsonb_build_array(jsonb_build_object('external_id', 'b1', 'status', 'read')),
      jsonb_build_array(jsonb_build_object('external_id', 'ch-1', 'state', 'blocked'),
                        jsonb_build_object('external_id', 'ch-wa', 'state', 'blocked'),
                        jsonb_build_object('external_id', 'ch-zzz', 'state', 'active')),
      ARRAY['instagram']);
  RAISE NOTICE 'пачка: %', r;
  IF (r ->> 'messages')::int <> 1 OR jsonb_array_length(r -> 'errors') <> 0
     OR jsonb_array_length(r -> 'skipped') <> 4 OR (r ->> 'channels')::int <> 1 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: итог пачки %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.messenger_chats WHERE chat_type = 'whatsapp' OR chat_id = '79005556677') THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: сообщение WhatsApp записано, хотя канал ещё в ОКО';
  END IF;
  IF (SELECT state FROM public.messenger_channels WHERE external_id = 'ch-wa') <> 'active' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: состояние неразрешённого канала обновилось';
  END IF;
  -- Пустой список разрешённых — не принимается ничего.
  r := public.messenger_ingest_batch('wazzup',
      jsonb_build_array(public.t_msg('b6', 'bob', 'in', now()::text, 'без списка')), '[]'::jsonb, '[]'::jsonb, '{}'::text[]);
  IF (r ->> 'messages')::int <> 0 OR jsonb_array_length(r -> 'skipped') <> 1
     OR EXISTS (SELECT 1 FROM public.messenger_messages WHERE external_id = 'b6') THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: при пустом списке что-то принято: %', r;
  END IF;
  -- Кривое сообщение Instagram — настоящая ошибка, но хорошее рядом пишется.
  r := public.messenger_ingest_batch('wazzup',
      jsonb_build_array(public.t_msg('b2', 'bob', 'in', now()::text, 'x') - 'chat_id',
                        public.t_msg('b5', 'bob', 'in', now()::text, 'ещё')),
      '[]'::jsonb, '[]'::jsonb, ARRAY['instagram']);
  IF (r ->> 'messages')::int <> 1 OR jsonb_array_length(r -> 'errors') <> 1 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: итог кривой пачки %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.messenger_chats WHERE chat_id = 'stranger')
     OR EXISTS (SELECT 1 FROM public.messenger_channels WHERE external_id IN ('ch-x', 'ch-zzz')) THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: сообщение или канал чужого канала записаны';
  END IF;
  -- bob — новый человек в Direct: ровно одна новая карточка, для stranger — ни одной.
  IF (SELECT count(*) FROM public.clients) <> v_clients + 1 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: клиентов после пачки % (ждали %)', (SELECT count(*) FROM public.clients), v_clients + 1;
  END IF;
  IF (SELECT state FROM public.messenger_channels WHERE external_id = 'ch-1') <> 'blocked' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: состояние канала не обновилось';
  END IF;
  UPDATE public.messenger_channels SET state = 'active' WHERE external_id = 'ch-1';
  RAISE NOTICE 'пачка: кривое не мешает хорошему, чужой канал не пишется';
END $$;
SELECT public.messenger_ingest_message('wazzup',
  public.t_msg('del-1', 'anna.travel', 'in', '2026-09-13T12:30:00Z', 'мой телефон 8 900 000') || '{"content_uri": "https://x/story.jpg"}');
SELECT public.messenger_ingest_message('wazzup',
  public.t_msg('del-1', 'anna.travel', 'in', '2026-09-13T12:30:00Z', NULL, NULL, NULL, false, false, true));
-- Повтор старого события (ещё с текстом) удалённое не воскрешает.
SELECT public.messenger_ingest_message('wazzup',
  public.t_msg('del-1', 'anna.travel', 'in', '2026-09-13T12:30:00Z', 'мой телефон 8 900 000'));
DO $$
DECLARE m record;
BEGIN
  SELECT text, content_uri, raw, is_deleted INTO m FROM public.messenger_messages WHERE external_id = 'del-1';
  IF NOT m.is_deleted OR m.text IS NOT NULL OR m.content_uri IS NOT NULL OR m.raw IS NOT NULL THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: удалённое не стёрто: % / % / %', m.text, m.content_uri, m.raw;
  END IF;
  RAISE NOTICE 'удалённое сообщение стёрто и не воскресает';
END $$;

\echo '=== 13б. удалённое стирается из сырого журнала во ВСЕХ событиях ==='
INSERT INTO public.messenger_events (provider, payload, processed_at) VALUES
 ('wazzup', '{"messages": [{"messageId": "del-2", "text": "паспорт 4510 123456", "contentUri": "https://x/pass.jpg"},
                           {"messageId": "keep-1", "text": "соседнее сообщение"}]}', now()),
 ('wazzup', '{"messages": [{"messageId": "del-2", "text": "паспорт 4510 123456", "isEdited": true,
                            "oldInfo": {"oldText": "паспорт 4510"}}]}', now()),
 ('wazzup', '{"statuses": [{"messageId": "del-2", "status": "read"}]}', now());
SELECT public.messenger_ingest_message('wazzup',
  public.t_msg('del-2', 'anna.travel', 'in', '2026-09-13T12:40:00Z', 'паспорт 4510 123456'));
SELECT public.messenger_ingest_message('wazzup',
  public.t_msg('del-2', 'anna.travel', 'in', '2026-09-13T12:40:00Z', NULL, NULL, NULL, false, false, true));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.messenger_events
              WHERE payload::text LIKE '%4510%' OR payload::text LIKE '%pass.jpg%' OR payload::text LIKE '%oldInfo%') THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: содержимое удалённого сообщения осталось в журнале';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.messenger_events
                  WHERE payload @> '{"messages": [{"messageId": "keep-1", "text": "соседнее сообщение"}]}') THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: соседнее сообщение пачки пострадало';
  END IF;
  IF (SELECT count(*) FROM public.messenger_events WHERE payload @> '{"messages": [{"messageId": "del-2"}]}') <> 2 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: сообщение исчезло из журнала целиком (стирать нужно только содержимое)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.messenger_events WHERE payload @> '{"statuses": [{"messageId": "del-2", "status": "read"}]}') THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: событие без messages изменилось';
  END IF;
  RAISE NOTICE 'журнал: удалённое стёрто во всех событиях, соседние целы';
END $$;
SELECT public.messenger_ingest_message('wazzup',
  jsonb_set(public.t_msg('g1', 'group-1', 'in', now()::text, 'всем привет') - 'identity_kind', '{chat_type}', '"whatsgroup"'));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.messenger_chats WHERE chat_type = 'whatsgroup' AND client_id IS NOT NULL) THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: групповой чат завёл клиента';
  END IF;
  RAISE NOTICE 'групповой чат без клиента';
END $$;

\echo '=== 14. повторный разбор: не раньше 2 минут, паузы растут, отсрочка без траты попытки ==='
INSERT INTO public.messenger_events (provider, payload, processed_at)
VALUES ('wazzup', '{"a":1}', now()), ('wazzup', '{"a":2}', NULL);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.messenger_events_to_retry(10)) <> 0 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: свежее событие выдано раньше 2 минут — вебхук мог ещё разбирать его';
  END IF;
END $$;
UPDATE public.messenger_events SET received_at = now() - interval '3 minutes' WHERE processed_at IS NULL;
DO $$
DECLARE v_id bigint; v_attempts int; v_next timestamptz;
BEGIN
  SELECT event_id INTO v_id FROM public.messenger_events_to_retry(10);
  IF v_id IS NULL THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: событие старше 2 минут не выдано'; END IF;
  IF (SELECT count(*) FROM public.messenger_events_to_retry(10)) <> 0 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: событие выдано повторно без паузы';
  END IF;
  PERFORM public.messenger_event_defer(v_id);
  SELECT attempts, next_try_at INTO v_attempts, v_next FROM public.messenger_events WHERE id = v_id;
  IF v_attempts <> 0 OR v_next <= now() THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: отсрочка потратила попытку (%) или не отодвинула (%)', v_attempts, v_next;
  END IF;
  UPDATE public.messenger_events SET attempts = 10, next_try_at = now() - interval '1 day' WHERE id = v_id;
  IF (SELECT count(*) FROM public.messenger_events_to_retry(10)) <> 0 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: после десяти попыток событие всё ещё выдаётся';
  END IF;
  RAISE NOTICE 'первая попытка через 2 минуты, отсрочка бесплатна, предел попыток работает';
END $$;

\echo '=== 15. отсрочка без траты попытки — не больше 5 раз подряд ==='
DO $$
DECLARE v_id bigint; v_attempts int; v_error text;
BEGIN
  INSERT INTO public.messenger_events (provider, payload, attempts, received_at)
  VALUES ('wazzup', '{"a": 3}', 8, now() - interval '1 hour') RETURNING id INTO v_id;
  FOR i IN 1..5 LOOP PERFORM public.messenger_event_defer(v_id); END LOOP;
  SELECT attempts INTO v_attempts FROM public.messenger_events WHERE id = v_id;
  IF v_attempts <> 3 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: после 5 отсрочек попыток % (ждали 3)', v_attempts; END IF;
  PERFORM public.messenger_event_defer(v_id);
  SELECT attempts, error INTO v_attempts, v_error FROM public.messenger_events WHERE id = v_id;
  IF v_attempts <> 3 OR v_error NOT LIKE '%засчитана как попытка%' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: шестая отсрочка вернула попытку (% / %)', v_attempts, v_error;
  END IF;
  RAISE NOTICE 'пять отсрочек бесплатно, шестая засчитана как попытка';
END $$;

\echo '=== 16. отложенные статусы старше 7 дней убираются при повторном разборе ==='
INSERT INTO public.messenger_pending_statuses (provider, external_id, status, received_at)
VALUES ('wazzup', 'old-status', 'read', now() - interval '8 days'),
       ('wazzup', 'fresh-status', 'read', now());
SELECT count(*) AS выдано FROM public.messenger_events_to_retry(1);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.messenger_pending_statuses WHERE external_id = 'old-status') THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: старый отложенный статус не убран';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.messenger_pending_statuses WHERE external_id = 'fresh-status') THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: свежий отложенный статус удалён';
  END IF;
  RAISE NOTICE 'старые отложенные статусы убраны, свежие на месте';
END $$;

\echo '=== ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ ==='
