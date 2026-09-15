-- Проверка карточки объекта на чистом Postgres (16.09.2026).
--
-- Что проверяется: отельер видит только свой отель и только публичную часть;
-- его правка ложится «на проверку» с отсевом мусора и чужих полей; менеджер
-- подтверждает или отклоняет; чужой отель и чужая роль — отказ.
--
-- Запуск:
--   createdb card_check
--   psql -q -v ON_ERROR_STOP=1 -d card_check -f scripts/checks/object_cards.sql
--   dropdb card_check
\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS auth;
-- Заглушки Supabase: роль из app.role, пользователь из app.uid.
CREATE FUNCTION public.current_app_role() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT current_setting('app.role', true) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;

CREATE TABLE public.hotels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text, city text, address text, phone text, user_id uuid
);
INSERT INTO public.hotels (id, title, user_id) VALUES
 ('10000000-0000-0000-0000-000000000001', 'Мулберри', '20000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002', 'Парус',    '20000000-0000-0000-0000-000000000002');

\i supabase/migrations/20260916090000_object_cards.sql

\echo '=== 1. отельер видит только свой отель ==='
SET app.role = 'hotel';
SET app.uid = '20000000-0000-0000-0000-000000000001';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.hotelier_cards();
  IF n <> 1 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: отельеру видно % отелей вместо 1', n; END IF;
  IF (SELECT title FROM public.hotelier_cards()) <> 'Мулберри' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: отельеру виден чужой отель';
  END IF;
  RAISE NOTICE 'свой отель — один';
END $$;

\echo '=== 2. правка отельера: чужие поля и мусор отсеиваются, ложится на проверку ==='
DO $$
DECLARE n int; d jsonb;
BEGIN
  SELECT public.hotelier_submit_card('10000000-0000-0000-0000-000000000001', '{
    "summary": "  Уютный отель у моря  ",
    "tariff": "exclusive",
    "owner_contact": "подмена",
    "min_nights": 3,
    "amenities": ["Wi-Fi", "  ", "Парковка"],
    "checkin": "",
    "kids": null,
    "мусор": 1
  }'::jsonb) INTO n;
  IF n <> 5 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: принято полей % вместо 5', n; END IF;
  SELECT draft INTO d FROM public.hotel_cards WHERE hotel_id = '10000000-0000-0000-0000-000000000001';
  IF d ? 'tariff' OR d ? 'owner_contact' OR d ? 'мусор' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: в правку попали внутренние поля: %', d;
  END IF;
  IF d ->> 'summary' <> 'Уютный отель у моря' THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: текст не обрезан: %', d; END IF;
  IF jsonb_array_length(d -> 'amenities') <> 2 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: пустые удобства не отсеяны: %', d; END IF;
  IF jsonb_typeof(d -> 'checkin') <> 'null' THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: пустая строка не стала NULL'; END IF;
  -- Карточка при этом НЕ изменилась: правка только на проверке.
  IF (SELECT summary FROM public.hotel_cards WHERE hotel_id = '10000000-0000-0000-0000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: правка опубликована без проверки';
  END IF;
  RAISE NOTICE 'правка на проверке, мусор отсеян';
END $$;

\echo '=== 3. неверный min_nights и не-объект — отказ или пропуск ==='
DO $$
DECLARE n int;
BEGIN
  SELECT public.hotelier_submit_card('10000000-0000-0000-0000-000000000001', '{"min_nights": 999}'::jsonb) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: min_nights 999 принят'; END IF;
  BEGIN
    PERFORM public.hotelier_submit_card('10000000-0000-0000-0000-000000000001', '[1,2]'::jsonb);
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: массив принят как правка';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'ОШИБКА ТЕСТА%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'мусорная правка отклонена';
END $$;

\echo '=== 4. чужой отель — отказ ==='
DO $$ BEGIN
  PERFORM public.hotelier_submit_card('10000000-0000-0000-0000-000000000002', '{"summary": "чужое"}'::jsonb);
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: правка чужого отеля принята';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'отказ, как и надо: не ваш отель';
END $$;

\echo '=== 5. отельер не может подтвердить сам себе ==='
DO $$ BEGIN
  PERFORM public.approve_card_draft('10000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: отельер подтвердил свою правку';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'отказ, как и надо';
END $$;

\echo '=== 6. менеджер подтверждает: поля переносятся, правка снимается ==='
SET app.role = 'admin';
SET app.uid = '';
DO $$
DECLARE n int; r record;
BEGIN
  SELECT public.approve_card_draft('10000000-0000-0000-0000-000000000001') INTO n;
  IF n <> 1 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: подтверждено % карточек', n; END IF;
  SELECT * INTO r FROM public.hotel_cards WHERE hotel_id = '10000000-0000-0000-0000-000000000001';
  IF r.summary <> 'Уютный отель у моря' OR r.min_nights <> 3 OR r.amenities <> ARRAY['Wi-Fi','Парковка']
     OR r.draft IS NOT NULL OR r.tariff <> 'basic' THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: перенос правки неверный: % % % %', r.summary, r.min_nights, r.amenities, r.tariff;
  END IF;
  -- Повторное подтверждение пустой правки — ничего.
  SELECT public.approve_card_draft('10000000-0000-0000-0000-000000000001') INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: подтверждена пустая правка'; END IF;
  RAISE NOTICE 'правка перенесена в карточку';
END $$;

\echo '=== 7. отклонение: карточка не меняется ==='
SET app.role = 'hotel';
SET app.uid = '20000000-0000-0000-0000-000000000001';
SELECT public.hotelier_submit_card('10000000-0000-0000-0000-000000000001', '{"summary": "Новый текст"}'::jsonb) AS принято;
SET app.role = 'admin';
SET app.uid = '';
DO $$
DECLARE r record;
BEGIN
  PERFORM public.reject_card_draft('10000000-0000-0000-0000-000000000001');
  SELECT * INTO r FROM public.hotel_cards WHERE hotel_id = '10000000-0000-0000-0000-000000000001';
  IF r.summary <> 'Уютный отель у моря' OR r.draft IS NOT NULL THEN
    RAISE EXCEPTION 'ОШИБКА ТЕСТА: отклонённая правка изменила карточку';
  END IF;
  RAISE NOTICE 'отклонено, карточка прежняя';
END $$;

\echo '=== 8. оператор и гость без роли — отказ ==='
SET app.role = 'operator';
DO $$ BEGIN
  PERFORM public.hotelier_submit_card('10000000-0000-0000-0000-000000000001', '{"summary": "x"}'::jsonb);
  RAISE EXCEPTION 'ОШИБКА ТЕСТА: оператор подал правку как отельер';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'отказ, как и надо';
END $$;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.hotelier_cards();
  IF n <> 0 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: оператору видны карточки отельера'; END IF;
  RAISE NOTICE 'оператору карточки отельера не видны';
END $$;

\echo '=== 9. ни одна функция не делает DELETE/UPDATE без WHERE (safeupdate) ==='
DO $$
DECLARE r record; stmt text; bad text[] := '{}';
BEGIN
  FOR r IN SELECT p.proname, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            JOIN pg_language l ON l.oid = p.prolang
           WHERE n.nspname = 'public' AND l.lanname IN ('plpgsql', 'sql') LOOP
    FOR stmt IN SELECT s FROM regexp_split_to_table(r.prosrc, ';') AS s LOOP
      stmt := regexp_replace(stmt, '--[^\n]*', '', 'g');
      IF (stmt ~* '\mDELETE\s+FROM\M' OR stmt ~* '\mUPDATE\s+[a-z_."]+(\s+AS\s+[a-z_]+)?\s+SET\M')
         AND stmt !~* '\mWHERE\M' THEN
        bad := bad || r.proname::text;
      END IF;
    END LOOP;
  END LOOP;
  IF cardinality(bad) > 0 THEN RAISE EXCEPTION 'ОШИБКА ТЕСТА: DELETE/UPDATE без WHERE: %', bad; END IF;
  RAISE NOTICE 'DELETE/UPDATE без WHERE нет';
END $$;

\echo '=== ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ ==='
