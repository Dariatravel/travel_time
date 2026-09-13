-- Проверка схемы мессенджеров (Instagram через Wazzup) на чистом Postgres (15.09.2026).
--
-- Функции разбора, уникальные ключи, «ждёт ответа» и права живут в базе —
-- обычными тестами их не проверить. Файл создаёт заглушки, накатывает
-- миграцию и прогоняет сценарии. Провал — «ОШИБКА ТЕСТА».
--
-- Запуск:
--   createdb msg_check
--   psql -q -v ON_ERROR_STOP=1 -d msg_check -f scripts/checks/messenger.sql
--   dropdb msg_check
\set ON_ERROR_STOP on

-- Заглушки того, что уже есть в рабочей базе.
CREATE TABLE public.clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text, note text,
    phones text[] NOT NULL DEFAULT '{}',
    is_provisional boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.current_app_role() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT current_setting('app.role', true) $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;

\i supabase/migrations/20260915090000_messenger_wazzup.sql

-- Сообщение в том виде, в каком его отдаёт normalize.ts.
CREATE FUNCTION public.t_msg(
    p_ext text, p_chat text, p_dir text, p_at text, p_text text,
    p_post text DEFAULT NULL, p_status text DEFAULT NULL,
    p_edited boolean DEFAULT false, p_from_app boolean DEFAULT false
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'external_id', p_ext, 'channel_external_id', 'ch-1', 'chat_type', 'instagram', 'chat_id', p_chat,
    'kind', CASE WHEN p_post IS NULL THEN 'direct' ELSE 'comment' END,
    'post', CASE WHEN p_post IS NULL THEN NULL ELSE jsonb_build_object(
              'external_id', p_post, 'src', 'https://www.instagram.com/p/' || p_post || '/',
              'description', 'Пост ' || p_post) END,
    'identity_kind', 'instagram',
    'contact', jsonb_build_object('name', 'Анна', 'username', p_chat),
    'direction', p_dir, 'is_echo', p_dir = 'out', 'sent_from_app', p_from_app,
    'type', 'text', 'text', p_text,
    'status', COALESCE(p_status, CASE WHEN p_dir = 'in' THEN 'inbound' ELSE 'sent' END),
    'is_edited', p_edited, 'sent_at', p_at, 'raw', jsonb_build_object('messageId', p_ext)))
$$;

CREATE FUNCTION public.t_waiting(p_chat text) RETURNS timestamptz LANGUAGE sql AS $$
  SELECT first_unanswered_at FROM public.messenger_chats WHERE chat_id = p_chat AND kind = 'direct'
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

\echo '=== 2. ник в другом регистре и с @ — тот же клиент ==='
SELECT public.messenger_ingest_message('wazzup', public.t_msg('d-case', 'Anna.Travel', 'in', '2026-09-13T09:00:00Z', 'привет'));
DO $$
DECLARE n int;
BEGIN
  SELECT count(DISTINCT client_id) INTO n FROM public.messenger_chats;
  IF n <> 1 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: клиентов у чатов % (ждали 1)', n; END IF;
  IF public.messenger_find_or_create_client('wazzup', 'instagram', '@ANNA.travel', 'x')
     IS DISTINCT FROM (SELECT client_id FROM public.messenger_chats LIMIT 1) THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: @ANNA.travel — другой клиент';
  END IF;
  IF public.messenger_find_or_create_client('wazzup', 'instagram', '  ', 'x') IS NOT NULL THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: пустой ник завёл клиента';
  END IF;
  IF (SELECT count(*) FROM public.clients) <> 1 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: появились лишние клиенты'; END IF;
  RAISE NOTICE 'регистр и @ не плодят клиентов';
END $$;

\echo '=== 3. «ждёт ответа» — первое входящее после нашего ответа, в любом порядке событий ==='
SELECT public.messenger_ingest_message('wazzup', public.t_msg('d2', 'anna.travel', 'in', '2026-09-13T10:05:00Z', 'Есть номера?'));
DO $$ BEGIN
  IF public.t_waiting('anna.travel') <> '2026-09-13T10:00:00Z' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: ждёт с % (ждали 10:00)', public.t_waiting('anna.travel');
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

\echo '=== 4. статус раньше эха; эхо не создаёт дубль; статусы только вперёд ==='
INSERT INTO public.messenger_outbox (id, chat_id, mode, text, status, external_message_id, created_by)
SELECT '30000000-0000-0000-0000-000000000001', id, 'direct', 'Да, на пятерых есть', 'pending', 'o-1', 'Дарья'
  FROM public.messenger_chats WHERE chat_id = 'anna.travel' AND kind = 'direct';
SELECT public.messenger_apply_status('wazzup', 'o-1', 'delivered', NULL, '2026-09-13T11:41:00Z') AS статус_до_эха;
SELECT public.messenger_ingest_message('wazzup', public.t_msg('o-1', 'anna.travel', 'out', '2026-09-13T11:40:00Z', 'Да, на пятерых есть'));
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

\echo '=== 5. ошибка доставки: очередь «не ушло», чат снова ждёт ==='
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

\echo '=== 6. связь оборвалась (unknown), но эхо пришло — очередь подтверждается по тексту ==='
INSERT INTO public.messenger_outbox (id, chat_id, mode, text, status)
SELECT '30000000-0000-0000-0000-000000000002', id, 'direct', 'Уточните даты', 'unknown'
  FROM public.messenger_chats WHERE chat_id = 'anna.travel' AND kind = 'direct';
SELECT public.messenger_ingest_message('wazzup', public.t_msg('o-2', 'anna.travel', 'out', now()::text, 'Уточните даты'));
DO $$
DECLARE r record;
BEGIN
  SELECT status, external_message_id INTO r FROM public.messenger_outbox WHERE id = '30000000-0000-0000-0000-000000000002';
  IF r.status <> 'sent' OR r.external_message_id <> 'o-2' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: неизвестная отправка не подтвердилась: % / %', r.status, r.external_message_id;
  END IF;
  RAISE NOTICE 'неизвестная отправка подтверждена эхом';
END $$;

\echo '=== 7. комментарии: разные посты — разные чаты, клиент тот же; правка не откатывается ==='
SELECT public.messenger_ingest_message('wazzup', public.t_msg('k1', 'anna.travel', 'in', '2026-09-13T08:00:00Z', 'Сколько стоит?', 'P1'));
SELECT public.messenger_ingest_message('wazzup', public.t_msg('k2', 'anna.travel', 'in', '2026-09-13T08:10:00Z', 'А тут?', 'P2'));
SELECT public.messenger_ingest_message('wazzup', public.t_msg('k3', 'anna.travel', 'in', '2026-09-13T08:20:00Z', 'Ещё вопрос', 'P1'));
SELECT public.messenger_ingest_message('wazzup', public.t_msg('k3', 'anna.travel', 'in', '2026-09-13T08:20:00Z', 'Ещё вопрос: есть ли парковка?', 'P1', NULL, true));
SELECT public.messenger_ingest_message('wazzup', public.t_msg('k3', 'anna.travel', 'in', '2026-09-13T08:20:00Z', 'Ещё вопрос', 'P1'));
DO $$
DECLARE n_chats int; n_posts int; n_clients int; v_text text;
BEGIN
  SELECT count(*) INTO n_chats FROM public.messenger_chats WHERE kind = 'comment';
  SELECT count(*) INTO n_posts FROM public.messenger_posts;
  SELECT count(DISTINCT client_id) INTO n_clients FROM public.messenger_chats;
  SELECT text INTO v_text FROM public.messenger_messages WHERE external_id = 'k3';
  IF n_chats <> 2 OR n_posts <> 2 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: чатов комментариев %, постов %', n_chats, n_posts; END IF;
  IF n_clients <> 1 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: комментарии завели другого клиента'; END IF;
  IF v_text <> 'Ещё вопрос: есть ли парковка?' THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: правка откатилась: %', v_text; END IF;
  RAISE NOTICE 'комментарии по постам раздельно, клиент один, правка на месте';
END $$;

\echo '=== 8. приватный ответ на комментарий закрывает ожидание и виден в списке ==='
INSERT INTO public.messenger_outbox (chat_id, mode, ref_external_id, text, status, sent_at, external_message_id)
SELECT c.id, 'comment_private', 'k3', 'Написали вам в Direct', 'sent', now(), 'o-3'
  FROM public.messenger_chats c JOIN public.messenger_posts p ON p.id = c.post_id
 WHERE p.external_id = 'P1';
SELECT public.messenger_refresh_chat(c.id)
  FROM public.messenger_chats c JOIN public.messenger_posts p ON p.id = c.post_id WHERE p.external_id = 'P1';
SET app.role = 'admin';
SELECT kind, external_chat_id, post_external_id, waiting_since IS NOT NULL AS ждёт, last_inbound_external_id, private_reply_used
  FROM public.messenger_chat_list('instagram', NULL, 50) ORDER BY kind, post_external_id NULLS FIRST, external_chat_id;
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
  IF (SELECT count(*) FROM public.messenger_chat_list('instagram', 'direct', 50)) <> 2 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: Direct-чатов в списке не 2';
  END IF;
  RAISE NOTICE 'список для экрана верный';
END $$;

\echo '=== 9. список и таблицы — только admin ==='
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

\echo '=== 10. кривые данные отклоняются ==='
DO $$ BEGIN
  PERFORM public.messenger_ingest_message('wazzup', public.t_msg('x1', 'anna.travel', 'in', now()::text, 'x') - 'chat_id');
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: сообщение без chat_id принято';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'ОШИБКА ТЕСТА%' THEN RAISE; END IF;
  RAISE NOTICE 'отказ, как и надо: %', SQLERRM;
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
-- Групповой чат: клиента не заводим.
SELECT public.messenger_ingest_message('wazzup',
  jsonb_set(public.t_msg('g1', 'group-1', 'in', now()::text, 'всем привет') - 'identity_kind', '{chat_type}', '"whatsgroup"'));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.messenger_chats WHERE chat_type = 'whatsgroup' AND client_id IS NOT NULL) THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: групповой чат завёл клиента';
  END IF;
  RAISE NOTICE 'групповой чат без клиента';
END $$;

\echo '=== 11. повторный разбор: паузы растут, после 10 попыток сдаёмся ==='
INSERT INTO public.messenger_events (provider, payload, processed_at)
VALUES ('wazzup', '{"a":1}', now()), ('wazzup', '{"a":2}', NULL);
SELECT count(*) AS взято_в_первый_раз FROM public.messenger_events_to_retry(10);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.messenger_events_to_retry(10)) <> 0 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: событие выдано повторно без паузы';
  END IF;
END $$;
UPDATE public.messenger_events SET attempts = 10, next_try_at = now() - interval '1 day' WHERE processed_at IS NULL;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.messenger_events_to_retry(10)) <> 0 THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: после десяти попыток событие всё ещё выдаётся';
  END IF;
  RAISE NOTICE 'пауза и предел попыток работают';
END $$;

\echo '=== ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ ==='
