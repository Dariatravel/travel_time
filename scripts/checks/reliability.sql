-- Проверка надёжности на чистом Postgres (14.09.2026).
--
-- Триггеры, права и сведение карточек нельзя проверить обычными тестами —
-- они живут в базе. Этот файл создаёт заглушки, накатывает миграции и
-- прогоняет сценарии. Каждый сценарий либо печатает ожидаемое, либо
-- падает с «ОШИБКА ТЕСТА».
--
-- Запуск:
--   createdb rel_check
--   psql -q -v ON_ERROR_STOP=1 -d rel_check -f scripts/checks/reliability.sql
--   dropdb rel_check
\set ON_ERROR_STOP on

CREATE TABLE public.hotels (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text);
CREATE TABLE public.reserves (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    oko_contact_id bigint UNIQUE, name text,
    phones text[] NOT NULL DEFAULT '{}', emails text[] NOT NULL DEFAULT '{}',
    telegram_user_id text, note text,
    oko_messenger_ids bigint[] NOT NULL DEFAULT '{}', oko_client_ids bigint[] NOT NULL DEFAULT '{}',
    last_incoming_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.deals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
    stage text NOT NULL DEFAULT 'zayavka', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.deal_messages (
    id bigserial PRIMARY KEY, client_id uuid REFERENCES public.clients (id) ON DELETE CASCADE,
    oko_message_id bigint UNIQUE, oko_contact_messenger_id bigint, oko_client_id bigint,
    integration_id integer, direction text, author_type text, text text, sent_at timestamptz
);
CREATE TABLE public.oko_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL
);
CREATE TABLE public.oko_webhook_events (
    oko_message_id bigint PRIMARY KEY, payload jsonb NOT NULL,
    processed_at timestamptz, error text, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.hotel_payouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id uuid NOT NULL REFERENCES public.hotels (id) ON DELETE CASCADE,
    paid_at date NOT NULL DEFAULT current_date,
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    method text, comment text, created_by text,
    created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, deleted_by text
);
CREATE TABLE public.finance_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id uuid NOT NULL REFERENCES public.hotels (id) ON DELETE CASCADE,
    reserve_id uuid REFERENCES public.reserves (id) ON DELETE SET NULL,
    date date NOT NULL DEFAULT current_date,
    direction text NOT NULL CHECK (direction IN ('we_owe_hotel','hotel_owes_us')),
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    comment text, created_by text,
    created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, deleted_by text
);
CREATE FUNCTION public.current_app_role() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT current_setting('app.role', true) $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;

-- Данные, как в рабочей базе ДО миграции.
INSERT INTO public.hotels (id, title) VALUES ('40000000-0000-0000-0000-000000000001','Отель у моря');
INSERT INTO public.hotel_payouts (hotel_id, amount) VALUES ('40000000-0000-0000-0000-000000000001', 5000);
INSERT INTO public.finance_adjustments (hotel_id, direction, amount)
VALUES ('40000000-0000-0000-0000-000000000001','we_owe_hotel', 300);
INSERT INTO public.clients (id, oko_contact_id, name, phones, oko_messenger_ids, oko_client_ids) VALUES
 ('a0000000-0000-0000-0000-000000000001', 100, 'Анна Петрова',  ARRAY['+79001112233'], ARRAY[501], ARRAY[900]),
 ('a0000000-0000-0000-0000-000000000002', 200, 'Борис Сидоров', ARRAY['+79002223344'], ARRAY[502], ARRAY[900]);
INSERT INTO public.clients (id, oko_contact_id, name, note, oko_messenger_ids) VALUES
 ('b0000000-0000-0000-0000-000000000001', NULL, 'Анна', 'Заведён по живому сообщению из ОКО', ARRAY[501]);
INSERT INTO public.clients (id, oko_contact_id, name, phones) VALUES
 ('c0000000-0000-0000-0000-000000000001', NULL, 'Свой клиент', ARRAY['+79009998877']);
INSERT INTO public.deal_messages (client_id, oko_contact_messenger_id, direction, author_type, text, sent_at)
VALUES ('b0000000-0000-0000-0000-000000000001', 501, 'in', 'contact', 'привет', now());

\i supabase/migrations/20260913150000_add_inbox.sql
\i supabase/migrations/20260913170000_inbox_robot.sql
\i supabase/migrations/20260913200000_temp_cards.sql
\i supabase/migrations/20260914090000_reliability_db.sql
\i supabase/migrations/20260914100000_webhook_reliability.sql

SET app.role = 'admin';

\echo '=== 1. отель с деньгами не удаляется, деньги не стираются ==='
DO $$ BEGIN
  DELETE FROM public.hotels WHERE id='40000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: отель удалился';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'отказ, как и надо: каскад закрыт';
END $$;
DO $$ BEGIN
  DELETE FROM public.hotel_payouts;
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: выплата удалилась';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'отказ, как и надо: выплату не удалить';
END $$;
DO $$ BEGIN
  UPDATE public.hotel_payouts SET amount = 1;
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: сумма переписалась';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'отказ, как и надо: сумму не переписать';
END $$;
UPDATE public.hotel_payouts SET deleted_at = now(), deleted_by = 'Дарья';

\echo '=== 2. спорный номер клиента НЕ стирается у настоящих клиентов ==='
-- 900 был у двоих: привязка достанется одному, но массивы обоих целы.
SELECT public.oko_find_or_create_client(502, NULL, 'Борис');
SELECT name, oko_client_ids FROM public.clients WHERE oko_contact_id IN (100, 200) ORDER BY name;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.clients
   WHERE oko_contact_id IN (100,200) AND NOT (oko_client_ids @> ARRAY[900::bigint]);
  IF n > 0 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: номер клиента стёрт у % карточек', n; END IF;
  RAISE NOTICE 'номера на месте у обоих';
END $$;

\echo '=== 3. загрузка связей не падает на повторе идентификатора ==='
-- Один и тот же номер клиента у двух разных контактов — раньше падало
-- «ON CONFLICT DO UPDATE command cannot affect row a second time».
SELECT public.oko_link_clients_batch('[
  {"oko_contact_id": 100, "oko_messenger_ids": [501], "oko_client_ids": [900]},
  {"oko_contact_id": 200, "oko_messenger_ids": [502], "oko_client_ids": [900]},
  {"oko_contact_id": 100, "oko_messenger_ids": [503], "oko_client_ids": []},
  {"oko_contact_id": 1.5, "oko_messenger_ids": [1]},
  {"oko_contact_id": "мусор", "oko_messenger_ids": [2]}
]'::jsonb) AS обновлено;

\echo '=== 4. клиента, заведённого руками, свести нельзя ==='
DO $$ BEGIN
  PERFORM public.oko_merge_clients('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: свой клиент слился';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'ОШИБКА ТЕСТА%' THEN RAISE; END IF;
  RAISE NOTICE 'отказ, как и надо: %', SQLERRM;
END $$;

\echo '=== 5. переписку нельзя отнять у настоящего клиента ==='
DO $$ BEGIN
  PERFORM public.oko_attach_chat(501, 'c0000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: переписку отняли';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'ОШИБКА ТЕСТА%' THEN RAISE; END IF;
  RAISE NOTICE 'отказ, как и надо: %', SQLERRM;
END $$;

\echo '=== 6. повторное сообщение не плодит клиентов ==='
SELECT public.oko_find_or_create_client(777, NULL, 'Новый гость') AS завёлся;
SELECT public.oko_find_or_create_client(777, NULL, 'Новый гость') AS он_же;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.clients WHERE oko_messenger_ids @> ARRAY[777::bigint];
  IF n <> 1 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: карточек с перепиской 777 — %', n; END IF;
  RAISE NOTICE 'карточка одна, как и надо';
END $$;

\echo '=== 7. сведение временной карточки ==='
SELECT temp_name, candidates, real_name FROM public.oko_temp_card_matches() ORDER BY temp_name;
SELECT public.oko_merge_temp_cards() AS сведено;
DO $$
DECLARE msgs int;
BEGIN
  SELECT count(*) INTO msgs FROM public.deal_messages
   WHERE client_id = 'a0000000-0000-0000-0000-000000000001';
  IF msgs <> 1 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: переписка не переехала (%)', msgs; END IF;
  IF EXISTS (SELECT 1 FROM public.clients WHERE id='b0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: временная карточка осталась';
  END IF;
  RAISE NOTICE 'переписка переехала, временная карточка убрана';
END $$;

\echo '=== 8. «Входящие» смотрят на явный признак ==='
SELECT messenger_id, client_name, is_temporary FROM public.oko_inbox(14, 100) ORDER BY messenger_id;

\echo '=== 9. отметка «последнее письмо» только вперёд ==='
-- Пусто → ставится; свежее → двигается; старое → не откатывает.
SELECT public.oko_touch_last_incoming('a0000000-0000-0000-0000-000000000001', now() - interval '1 hour');
SELECT public.oko_touch_last_incoming('a0000000-0000-0000-0000-000000000001', now() - interval '10 days');
DO $$
DECLARE t timestamptz;
BEGIN
  SELECT last_incoming_at INTO t FROM public.clients WHERE oko_contact_id = 100;
  IF t IS NULL OR t < now() - interval '2 hours' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: отметка откатилась назад (%)', t;
  END IF;
  RAISE NOTICE 'отметка назад не откатилась';
END $$;

\echo '=== 10. повторный разбор: паузы растут, после 10 попыток сдаёмся ==='
INSERT INTO public.oko_webhook_events (oko_message_id, payload, processed_at)
VALUES (1, '{"a":1}', now()), (2, '{"a":2}', NULL);
SELECT count(*) AS взято_в_первый_раз FROM public.oko_events_to_retry(10);
SELECT count(*) AS сразу_повторно FROM public.oko_events_to_retry(10);
UPDATE public.oko_webhook_events SET attempts = 10, next_try_at = now() - interval '1 day'
 WHERE processed_at IS NULL;
SELECT count(*) AS после_десяти_попыток FROM public.oko_events_to_retry(10);

\echo '=== 11. круг сверки двигается ==='
UPDATE public.clients SET last_incoming_at = now() WHERE oko_contact_id IS NOT NULL;
SELECT count(*) AS первый_заход FROM public.oko_contacts_to_reconcile(5);
SELECT count(*) AS второй_заход_пусто FROM public.oko_contacts_to_reconcile(5);

\echo '=== ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ ==='
