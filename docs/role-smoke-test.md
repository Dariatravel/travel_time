# Смоук-тест ролей — приёмка миграций безопасности

Проверяет, что после миграций (`20260818204327…204803`) права работают правильно
для `admin`, `operator`, `hotel` и анонима, и что **повышение прав подделкой
`user_metadata` больше не работает**.

## Главное правило: сначала убедиться, что тест краснеет

Зелёный тест на непроверенном коде ничего не доказывает. Порядок:

1. **Прогнать Часть А на текущем проде (до миграций).**
   Ожидаемо: проверки **1, 2, 3, 7, 9, 10 проваливаются** — это и есть дыры, которые чиним
   (эталонный результат ниже). Если они прошли «зелёными» — значит тест написан неверно,
   чинить надо тест, а не радоваться.
2. Применить миграции на **копии/staging**.
3. Прогнать Часть А там же → все проверки PASS.
4. Прогнать Часть Б (роуты) → все PASS.
5. Только после этого — прод, и сразу после применения повторить Части А и Б на проде.

## Где запускать

- **Часть А (SQL)** — Supabase SQL Editor. Скрипт целиком обёрнут в транзакцию с
  `ROLLBACK`: он **ничего не меняет**, его безопасно гонять и на проде.
- **Часть Б (HTTP)** — только на копии/staging: создаёт временных пользователей.

---

## Часть А. Проверка RLS (SQL, read-only)

Скрипт сам находит подходящих пользователей: отельера-владельца, второго отельера,
оператора и админа. Эмулирует их JWT так же, как это делает PostgREST
(`request.jwt.claims` + роль `authenticated`), и сверяет фактический доступ с ожидаемым.

```sql
BEGIN;
CREATE TEMP TABLE smoke_result (n int, check_name text, expected text, actual text, status text) ON COMMIT DROP;
DO $$
DECLARE
    v_hotel_user uuid; v_other_hotel uuid; v_own int; v_admin uuid; v_operator uuid;
    v_seen int; v_total int; v_err text;
BEGIN
    SELECT count(*) INTO v_total FROM public.hotels;
    SELECT h.user_id INTO v_hotel_user FROM public.hotels h JOIN auth.users u ON u.id=h.user_id
      WHERE u.raw_user_meta_data->>'role'='hotel' LIMIT 1;
    SELECT count(*) INTO v_own FROM public.hotels WHERE user_id=v_hotel_user;
    SELECT id INTO v_other_hotel FROM public.hotels WHERE user_id IS DISTINCT FROM v_hotel_user LIMIT 1;
    SELECT u.id INTO v_admin FROM auth.users u WHERE u.raw_user_meta_data->>'role'='admin' LIMIT 1;
    SELECT u.id INTO v_operator FROM auth.users u WHERE u.raw_user_meta_data->>'role'='operator' LIMIT 1;

    -- 1. эскалация подделкой user_metadata
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_hotel_user,'role','authenticated',
        'user_metadata',json_build_object('role','admin'))::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_seen FROM public.hotels;
    EXECUTE 'RESET ROLE';
    INSERT INTO smoke_result VALUES (1,'Отельер с подделанным user_metadata.role=admin видит только свои отели',
        v_own||' (свои)', v_seen::text, CASE WHEN v_seen=v_own THEN 'PASS' ELSE 'FAIL — ЭСКАЛАЦИЯ' END);

    -- 2. чужие брони
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_hotel_user,'role','authenticated',
        'user_metadata',json_build_object('role','admin'))::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_seen FROM public.reserves rz JOIN public.rooms rm ON rm.id=rz.room_id
      WHERE rm.hotel_id=v_other_hotel;
    EXECUTE 'RESET ROLE';
    INSERT INTO smoke_result VALUES (2,'Отельер не видит брони чужого отеля','0',v_seen::text,
        CASE WHEN v_seen=0 THEN 'PASS' ELSE 'FAIL — УТЕЧКА БРОНЕЙ' END);

    -- 3. самоповышение в user_roles (если таблица есть)
    IF to_regclass('public.user_roles') IS NULL THEN
        INSERT INTO smoke_result VALUES (3,'Отельер не может изменить свою роль','отказ','таблицы user_roles нет','FAIL — миграция не применена');
    ELSE
        PERFORM set_config('request.jwt.claims', json_build_object('sub',v_hotel_user,'role','authenticated')::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        v_err := NULL;
        BEGIN
            UPDATE public.user_roles SET role='admin' WHERE user_id=v_hotel_user;
            GET DIAGNOSTICS v_seen = ROW_COUNT;
        EXCEPTION WHEN others THEN v_seen := 0; v_err := SQLERRM; END;
        EXECUTE 'RESET ROLE';
        INSERT INTO smoke_result VALUES (3,'Отельер не может изменить свою роль на admin','0 строк',
            v_seen||' строк'||COALESCE(' / '||v_err,''), CASE WHEN v_seen=0 THEN 'PASS' ELSE 'FAIL — САМОПОВЫШЕНИЕ' END);
    END IF;

    -- 4. чужие номера
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_hotel_user,'role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_seen FROM public.rooms WHERE hotel_id=v_other_hotel;
    EXECUTE 'RESET ROLE';
    INSERT INTO smoke_result VALUES (4,'Отельер не видит номера чужого отеля','0',v_seen::text,
        CASE WHEN v_seen=0 THEN 'PASS' ELSE 'FAIL' END);

    -- 5. оператор видит всё
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_operator,'role','authenticated',
        'user_metadata',json_build_object('role','operator'))::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_seen FROM public.hotels;
    EXECUTE 'RESET ROLE';
    INSERT INTO smoke_result VALUES (5,'Оператор видит все отели',v_total::text,v_seen::text,
        CASE WHEN v_seen=v_total THEN 'PASS' ELSE 'FAIL — оператор потерял доступ' END);

    -- 6. админ видит всё
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated',
        'user_metadata',json_build_object('role','admin'))::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_seen FROM public.hotels;
    EXECUTE 'RESET ROLE';
    INSERT INTO smoke_result VALUES (6,'Админ видит все отели',v_total::text,v_seen::text,
        CASE WHEN v_seen=v_total THEN 'PASS' ELSE 'FAIL — админ потерял доступ' END);

    -- 7. list_assignable_users отельеру
    IF to_regproc('public.list_assignable_users') IS NULL THEN
        INSERT INTO smoke_result VALUES (7,'list_assignable_users: отельеру пусто','0','функции нет','FAIL — миграция не применена');
    ELSE
        PERFORM set_config('request.jwt.claims', json_build_object('sub',v_hotel_user,'role','authenticated',
            'user_metadata',json_build_object('role','admin'))::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        BEGIN SELECT count(*) INTO v_seen FROM public.list_assignable_users();
        EXCEPTION WHEN others THEN v_seen := -1; END;
        EXECUTE 'RESET ROLE';
        INSERT INTO smoke_result VALUES (7,'list_assignable_users: отельер получает пусто','0',v_seen::text,
            CASE WHEN v_seen=0 THEN 'PASS' WHEN v_seen=-1 THEN 'PASS (отказ)' ELSE 'FAIL — утечка' END);
    END IF;

    -- 8. аноним
    PERFORM set_config('request.jwt.claims', NULL, true);
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT count(*) INTO v_seen FROM public.hotels;
    EXECUTE 'RESET ROLE';
    INSERT INTO smoke_result VALUES (8,'Аноним не видит отели','0',v_seen::text,
        CASE WHEN v_seen=0 THEN 'PASS' ELSE 'FAIL — публичная утечка' END);

    -- 9. старая функция удалена
    SELECT count(*) INTO v_seen FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='get_raw_user_meta_data';
    INSERT INTO smoke_result VALUES (9,'get_raw_user_meta_data удалена','0',v_seen::text,
        CASE WHEN v_seen=0 THEN 'PASS' ELSE 'FAIL — функция жива' END);

    -- 10. политики на user_metadata
    SELECT count(*) INTO v_seen FROM pg_policies WHERE schemaname='public'
      AND (qual LIKE '%user_metadata%' OR with_check LIKE '%user_metadata%');
    INSERT INTO smoke_result VALUES (10,'Политик на user_metadata не осталось','0',v_seen::text,
        CASE WHEN v_seen=0 THEN 'PASS' ELSE 'FAIL — старые политики живы' END);
END $$;
SELECT n, status, check_name, expected AS ozhidalos, actual AS polucheno FROM smoke_result ORDER BY n;
ROLLBACK;
```

### Эталонный «красный» результат (снят на проде 19.08, до миграций)

Скрипт проверен на живой базе — он действительно ловит проблему:

```
 1 [FAIL — ЭСКАЛАЦИЯ]            Отельер видит 232 отеля вместо 1 своего
 2 [FAIL — УТЕЧКА БРОНЕЙ]        Отельеру видны 56 чужих броней
 3 [FAIL — миграция не применена] таблицы user_roles нет
 4 [PASS]                        Чужие номера не видны (базовый scope работает и сейчас)
 5 [PASS]                        Оператор видит все 232 отеля
 6 [PASS]                        Админ видит все 232 отеля
 7 [FAIL — миграция не применена] функции list_assignable_users нет
 8 [PASS]                        Аноним не видит отели
 9 [FAIL — функция жива]         get_raw_user_meta_data на месте
10 [FAIL — старые политики живы]  12 политик читают user_metadata
```

Строки 4, 5, 6, 8 зелёные **и до миграций** — это нормально: они контролируют, что
миграция ничего не сломала (оператор и админ не потеряли доступ, аноним по-прежнему
ничего не видит). Их задача — поймать регресс, а не дыру.

После применения миграций все строки 1–10 должны стать `PASS`.

### Как читать результат
- **Все строки 1–10 `PASS`** → RLS в порядке.
- `FAIL` в 1, 2, 7 → **повышение прав всё ещё возможно**, на прод нельзя.
- `FAIL` в 5, 6 → миграция сломала доступ своим же (оператор или админ потеряли права) —
  откатываться по `down`-миграции, не чинить на живой базе.
- `FAIL` в 3, 9, 10 → миграции применены не полностью.

---

## Часть Б. Проверка роутов (HTTP, только staging/копия)

Проверяет то, что SQL не покрывает: сессию и scope в календарном роуте.

**Подготовка.** Через Admin API создать трёх временных пользователей
(`smoke-admin@`, `smoke-hotel-a@`, `smoke-hotel-b@`), назначить роли в `user_roles`,
привязать `smoke-hotel-a@` владельцем к тестовому отелю. После теста — удалить.

**Проверки** (`{HOTEL_A}` — отель пользователя A):

| # | Кто | Запрос | Ожидание |
|---|---|---|---|
| Б1 | без токена | `GET /api/yandex-backend/hotels/{HOTEL_A}/calendar` | **401** |
| Б2 | hotel-B | тот же | **403** |
| Б3 | hotel-A | тот же | **200**, в ответе есть `reserves` |
| Б4 | admin | тот же | **200** |
| Б5 | hotel-B, затем hotel-A подряд | тот же URL дважды | у B — 403, у A — 200 (**кэш не отдал чужой ответ**) |
| Б6 | hotel-B | `PATCH /api/yandex-backend/reserves/{ID}` с `external_source` | **403** «read-only» |

```bash
# пример одной проверки
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<staging>/api/yandex-backend/hotels/$HOTEL_A/calendar"                 # ждём 401
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_B" \
  "https://<staging>/api/yandex-backend/hotels/$HOTEL_A/calendar"                 # ждём 403
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_A" \
  "https://<staging>/api/yandex-backend/hotels/$HOTEL_A/calendar"                 # ждём 200
```

**Б5 — самая важная проверка.** Кэш роута раньше сегментировался по заголовку,
который ни на что не влиял. Если после правки B и A получают один и тот же
закэшированный ответ — это утечка чужих данных, несмотря на верные 401/403.

---

## Критерии приёмки (прод)

Выкатывать можно, только когда одновременно:
- Часть А: строки 1–10 → `PASS`;
- Часть Б: Б1–Б6 → как в таблице;
- `down`-миграции написаны и **проверены на копии** (откат возвращает рабочее состояние);
- код и миграции уходят **одним деплоем** — код уже читает `user_roles`, без неё
  создание броней и календарь упадут;
- шахматка открывается, бронь создаётся/редактируется, поиск находит номера.

## Если что-то упало на проде
1. Применить `down`-миграцию (не чинить на живой базе).
2. Проверить, что Часть А снова даёт прежнюю картину, а шахматка работает.
3. Разобрать причину на копии и вернуться с исправленной миграцией.
