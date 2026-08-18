# ТЗ для Cursor — безопасность и целостность Travel Time (P0/P1)

> **Версия 3, проверка от 18.08.2026** на актуальном `origin/main` (локальная копия отставала
> на 16 коммитов — перепроверено после `git pull`). Учтены правки владельца по итогам ревью v2.
> Каждый этап = **отдельная ветка и PR** (миграция → тесты → build → смоук-тест ролей →
> rollback-план). **Не мержить в `main` без подтверждения владельца.**

## Что изменилось в v3 (по ревью)
1. **Исправлен порядок**: `list_assignable_users()` зависела от `user_roles`/`current_app_role()`
   из P0-1, а стояла в этапе раньше — функция бы не создалась. Разбито на **Этап 0** (закрыть
   утечку немедленно, без зависимостей) и **Этап 2** (финализация после ролей).
2. **Один источник истины роли**: `user_roles`. Дублирование в `app_metadata` по умолчанию
   **не делаем** (см. P0-1.6).
3. **`search_path`** у всех `SECURITY DEFINER` — жёстко зафиксирован; политики `user_roles`
   расписаны явно, включая запрет менять собственную роль и защиту последнего админа.
4. **Обязательная перепроверка фактов** перед каждым этапом (раздел в конце).

## Статус (перепроверено 18.08 на origin/main)

| Пункт | Статус |
|---|---|
| Уведомления о поломке синка | ✅ есть (`.github/workflows/sync-alerts.yml`), неполные — дополнить в P0-3 |
| P0-1 роли | ❌ 124 роли в `user_metadata`, в `app_metadata` — 0; 12 политик читают редактируемое поле |
| P0-2a `get_raw_user_meta_data` | ❌ `SECURITY DEFINER`, EXECUTE у `anon` и `authenticated` |
| P0-2b `hotels_with_rooms_new` | ❌ `security_invoker` не выставлен |
| P0-2c calendar-роут | ❌ сессия не проверяется. **Уточнение:** заголовок `authorization` читается (`route.ts:53`), но идёт только в ключ кэша (`:30-33, :60`) — авторизацией не является |
| P0-3 транзакционный синк | ❌ нет `sync_*` RPC, нет `sync_runs`; в UI `external_source` не читается |
| P0-4 единая доступность | ❌ `get_available_hotels` без `booking_night_range`, без `room_closures`, сырое `start < end_time`; Telegram (`supabase/functions/telegram-bot/answerAvailability.ts:142,240`) — секундная логика |
| P1 | ❌ не начато |

**`npm audit` на 18.08:** 21 пакет — **1 critical, 13 high, 3 moderate, 4 low**.
Без доступного фикса — только `xlsx`. Прямые зависимости с уязвимостями:
`next`, `lodash`, `postcss`, `eslint`, `@supabase/supabase-js`, `xlsx`.
Числа зависят от даты и lock-файла — **перед работой запустить `npm audit` заново**
(см. раздел «Перепроверка фактов»).

## Железные правила
- **Service role — только на сервере/в кронах**, никогда в браузере.
- **Не удалять ручные брони и внешние метки** (`manual_belvedere`, `external_source IS NOT NULL`,
  `created_by='realtycalendar_webhook'`).
- Каждую политику проверять **отдельно для `admin`, `operator`, `hotel`**.
- Все `SECURITY DEFINER`-функции — с фиксированным `search_path` (см. ниже).
- Каждый этап обратим: миграция парой `up`/`down`, rollback-план в PR.

---

## Этап 0 (СРОЧНО, без зависимостей). Закрыть утечку метаданных

> ⚠️ **Этапы 0 → 1 → 2 не разрывать во времени.** Временная `list_assignable_users` (v1)
> ниже безопаснее текущего состояния (нет `anon`-доступа, отдаются только нужные поля), но
> **всё ещё доверяет редактируемому `user_metadata`** — то есть подделке роли. Это осознанный
> короткий переход, а не рабочее состояние. Пройти все три этапа одним заходом (максимум —
> один рабочий цикл). Если Этап 1 затягивается, это **не повод «пожить на v1»**: вернуться и
> закрыть. Проверка готовности: `list_assignable_users` больше не содержит `user_metadata`
> (см. Этап 2, 2a-финал).

**Факт:** `public.get_raw_user_meta_data()` — `SECURITY DEFINER`, EXECUTE у `anon` и
`authenticated`, тело `SELECT raw_user_meta_data FROM auth.users` → отдаёт метаданные
**всех 124 пользователей любому, включая незалогиненных**.
Единственный потребитель: `src/shared/api/auth/auth.ts:86` → `src/features/HotelModal/ui/HotelModal.tsx:89`
(выбор владельца отеля).

**Важно:** просто отозвать права — сломается выбор владельца в форме отеля. Поэтому в одном
PR: отзыв + узкая временная замена. Замена на этом этапе **ещё читает роль из
`user_metadata`** — это осознанно: мы не ухудшаем текущую модель (роль и так подделывается),
но убираем `anon`-доступ и лишние поля. На Этапе 2 функция переключается на `current_app_role()`.

```sql
-- 1) закрыть доступ
revoke execute on function public.get_raw_user_meta_data() from anon, authenticated;

-- 2) временная узкая замена (v1): только staff, только нужные поля
create or replace function public.list_assignable_users()
returns table (id uuid, email text, name text, role text)
language sql
stable
security definer
set search_path = ''            -- все имена ниже полностью квалифицированы
as $$
  select u.id,
         u.email::text,
         coalesce(u.raw_user_meta_data ->> 'name', '')::text,
         (u.raw_user_meta_data ->> 'role')::text
  from auth.users u
  where coalesce(((auth.jwt() -> 'user_metadata') ->> 'role'), '') in ('admin','operator')
$$;

revoke all on function public.list_assignable_users() from public, anon;
grant execute on function public.list_assignable_users() to authenticated;
```

Код: заменить вызов в `src/shared/api/auth/auth.ts:86` на `list_assignable_users`.
`drop function public.get_raw_user_meta_data()` — **только после** проверки, что UI работает
(можно отдельным коммитом в этом же PR).

**Проверка:** анонимным ключом вызвать обе функции → отказ; отельером → пустой список;
админом → список пользователей; форма отеля показывает владельцев.

**Rollback:** `grant execute ... to authenticated` вернуть (но **не `anon`**), вернуть вызов в коде.

---

## P0-1 (Этап 1). Роли: защищённое хранилище + переписать RLS

**Факт:** роль читается как `((auth.jwt() -> 'user_metadata') ->> 'role')` в 12 политиках:
`hotels` (ALL), `rooms` (ALL), `reserves` (ALL), `room_closures` ×4,
`reserve_deleted_items` ×4, `realtycalendar_webhook_events` (SELECT).
`user_metadata` меняется самим пользователем → **повышение прав в одну строку**.
Роли сейчас: 110 `hotel`, 12 `operator`, 2 `admin`; в `app_metadata` — 0.
`reserve_history_select_scoped` роль не использует — не трогать.

### 1. Таблица-источник истины
```sql
create table public.user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin','operator','hotel')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.user_roles enable row level security;
```

### 2. Функция чтения роли
```sql
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''            -- жёстко; все имена квалифицированы
as $$
  select r.role from public.user_roles r where r.user_id = auth.uid()
$$;

revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;
```
> **Про `search_path`.** Требование ревью выполнено с запасом: вместо `pg_catalog, public`
> берём `search_path = ''` и **полностью квалифицированные имена** (`public.user_roles`,
> `auth.users`). `pg_catalog` в пути присутствует неявно всегда, а пустой путь исключает
> подмену объектов через тень в `public`. Минимально допустимый вариант, если `''` где-то
> неудобен: `set search_path = pg_catalog, public`. **Без `set search_path` не оставлять ни одну
> `SECURITY DEFINER`-функцию.**

### 3. Бэкофилл (до переключения политик)
```sql
insert into public.user_roles (user_id, role)
select id, raw_user_meta_data ->> 'role'
from auth.users
where raw_user_meta_data ->> 'role' in ('admin','operator','hotel')
on conflict (user_id) do update set role = excluded.role, updated_at = now();
```
Сверка: `select count(*) from public.user_roles` = 124; распределение 110/12/2.

### 4. Политики на `user_roles` (детально — по ревью)
```sql
-- читать: свою строку — любой authenticated; все строки — только admin
create policy user_roles_select on public.user_roles for select to authenticated
  using ( user_id = auth.uid() or public.current_app_role() = 'admin' );

-- писать: ТОЛЬКО admin. Обычный пользователь не может изменить даже свою строку.
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check ( public.current_app_role() = 'admin' );
create policy user_roles_update on public.user_roles for update to authenticated
  using ( public.current_app_role() = 'admin' )
  with check ( public.current_app_role() = 'admin' );
create policy user_roles_delete on public.user_roles for delete to authenticated
  using ( public.current_app_role() = 'admin' );
```
Дополнительно (обязательно):
- **`updated_by` не доверять клиенту** — заполнять триггером `before insert or update`:
  `new.updated_by := auth.uid(); new.updated_at := now();`
- **Защита последнего админа** — триггер, запрещающий удалить/понизить последнего `admin`
  (иначе система остаётся без администраторов и роли станет некому назначать).
- Явно проверить в смоук-тесте: `hotel` и `operator` **не могут** изменить свою роль,
  не могут вставить себе строку, не могут переписать `updated_by`.

### 5. Переписать 12 политик на `current_app_role()`
Логику scope сохранить **без изменений**, поменять только источник роли. Пример (`hotels`):
```sql
using      ( public.current_app_role() = any(array['admin','operator']) or auth.uid() = hotels.user_id )
with check ( public.current_app_role() = any(array['admin','operator']) or auth.uid() = hotels.user_id )
```
Аналогично для `rooms`, `reserves`, `room_closures` (×4), `reserve_deleted_items` (×4),
`realtycalendar_webhook_events`.

### 6. Про `app_metadata` — решение по ревью
**По умолчанию НЕ дублируем роль в `app_metadata`.** Причина: два источника неизбежно
расходятся, а расхождение в правах — худший класс багов. Источник истины один — `user_roles`;
серверный код при необходимости читает роль через `current_app_role()` (или напрямую из
`user_roles` service-role-клиентом).

Если дублирование всё же понадобится (например, для проверки прямо из JWT без запроса в БД) —
только так:
- **единственный admin-only путь назначения роли** (RPC/Edge Function): пишет `user_roles` →
  затем Admin API обновляет `app_metadata`;
- при ошибке второго шага — **операция считается неуспешной**, расхождение пишется в лог и
  показывается админу (не «тихо разошлись»);
- **периодическая сверка** (добавить в `scripts/health-check.mjs`): расхождение
  `user_roles.role` vs `app_metadata.role` → алерт;
- RLS в любом случае **читает только `user_roles`**.

### 7. Rollout без блокировки 124 пользователей
Порядок в одной транзакции: таблица + функция + триггеры → бэкофилл → **создать новые политики
рядом со старыми** → прогнать смоук-тест ролей → **удалить старые политики** отдельным шагом.
Между шагами доступ не пропадает. Релогин пользователям не нужен (роль читается из таблицы).

### 8. Rollback
`down`: вернуть старые политики (полный текст сохранить в PR — снять
`select policyname, cmd, qual, with_check from pg_policies` до изменений),
удалить новые политики, `drop function public.current_app_role()`,
`drop table public.user_roles`. Роли остаются в `user_metadata` — данные не теряются.

---

## Этап 2. Финализация P0-2a + закрыть view и calendar-роут

### 2a-финал. Переключить `list_assignable_users` на новый источник роли
```sql
create or replace function public.list_assignable_users()
returns table (id uuid, email text, name text, role text)
language sql stable security definer
set search_path = ''
as $$
  select u.id, u.email::text,
         coalesce(u.raw_user_meta_data ->> 'name','')::text,
         r.role
  from auth.users u
  left join public.user_roles r on r.user_id = u.id
  where public.current_app_role() = any(array['admin','operator'])
$$;
```
Затем `drop function public.get_raw_user_meta_data();` (если не удалена на Этапе 0).

### 2b. `hotels_with_rooms_new` обходит RLS
`alter view public.hotels_with_rooms_new set (security_invoker = on);`
Потребители: calendar-роут, `HotelModal.tsx`, `hotel.ts` — проверить, что все видят нужные строки
(в роуте доступ под service role, ему `invoker` не мешает; клиентские — под RLS пользователя).

### 2c. `/api/yandex-backend/hotels/[hotelId]/calendar`
**Факт:** service-role клиент (`route.ts:73`), проверки сессии нет; `authorization` только
хешируется в ключ кэша (`:30-33, :53, :60`); ответ — `rooms(*, reserves(*))`, то есть все поля
броней, включая `guest` и `phone`, по одному `hotelId` в URL.

1. Проверять сессию (SSR-клиент из cookie) → 401 без неё.
2. Scope: staff (`admin`/`operator`) **или** владелец (`hotels.user_id = auth.uid()`) → иначе 403.
3. **Два DTO**: полный (staff/владелец) и маскированный «занято/свободно» без
   `guest`/`phone`/`comment`/`price`. По умолчанию — маскированный.
4. **Ключ кэша обязан включать роль/владельца**, иначе ответ одного пользователя утечёт
   другому. Сейчас сегмент строится из `authorization`; после введения сессии — привязать
   к user_id + вычисленному уровню доступа.
5. Те же проверки: `hotels/available/route.ts`, `reserves/route.ts`, `admin/operators/route.ts`.
   Учесть новый `src/app/api/yandex-backend/_lib/gatewayProxy.ts` (появился после 12.08) —
   проверить, не проксирует ли он эти маршруты в обход новых проверок.

**Rollback:** feature-flag на маскирование, чтобы быстро вернуть прежнее поведение, если
сломается подбор.

---

## Этап 3 (P0-4). Единая логика доступности

**Факты:** ночная семантика — DB-триггер
`supabase/migrations/20260713_prevent_double_booking.sql:29` (`booking_night_range`, int8range,
overlap `&&` :94) + `room_closures` EXCLUDE gist :39-44; канонический TS-хелпер
`src/shared/lib/reserveOverlap.ts:18-23`. **`booking_night_range` в БД уже есть.**
Секундная семантика (расходится): `get_available_hotels` (перепроверено 18.08 —
`booking_night_range` не используется, `room_closures` не учтены, сырое `start < end_time`),
legacy `get_hotels_with_free_rooms_in_period`, drag броней (`reserveMove.ts:57`,
`useReserveDragMove.ts:122`) против ночного drag closures (`useClosureDragMove`),
Telegram (`src/app/api/telegram/_lib/answerAvailability.ts` и копия
`supabase/functions/telegram-bot/answerAvailability.ts:142,240`).
Дубли ночной логики: `yandex-backend/reserves/route.ts:66-85`,
`reserves/[reserveId]/route.ts:63`, `timelineBlocks.ts:89-104`, все sync-скрипты. **Итого 8+.**
Следствие: выезд 12:00 и заезд 14:00 **в один день** база разрешает, а поиск считает занятым —
теряются продажи.

1. Единственный источник истины: `booking_night_range` (SQL) + `reserveOverlap.ts` (TS).
2. Переписать `get_available_hotels` (и legacy) на ночную логику, **учесть `quantity`
   и вычесть `room_closures` внутри RPC**.
3. Заменить секундные дубли на канонический хелпер (список выше); две копии Telegram-логики
   свести в общий модуль.
4. Согласовать `Math.floor` (JS) и целочисленное деление (SQL); зафиксировать тестом.
5. **Тесты:** выезд-12:00 + заезд-14:00 в один день = свободно (в БД **и в поиске**);
   пересечение на 1 ночь = занято; `room_closures` вычитаются в поиске;
   drag брони и drag closure дают одинаковый вердикт.

**Rollback:** RPC — миграция up/down (старый текст в PR); TS-дубли — один PR под тестами.

---

## Этап 4 (P0-3). Транзакционный синк + read-only внешние брони

**Факты:** все зеркала — DELETE своих меток → INSERT по одной, **без транзакции**
(`src/app/api/mirror/_lib/syncMirror.ts` :210-245, :370-405, :506-541, :640-692;
`scripts/mirror-cron-sync.mjs` :303-334, :364-395; `scripts/bnovo-cron-sync.mjs:190-246`;
`scripts/googlesheet-cron-sync.py:306-341`). Между delete и insert номера выглядят свободными.
`syncShelter` **двигает ручные брони** (`syncMirror.ts:651-661`), 23P01 глотает молча.
`googlesheet-cron-sync.py:306` — **результат DELETE отбрасывается**.
`realtycalendar/webhook/route.ts` создаёт брони **без `external_source`** (:331-344).
Образец правильной реализации — `src/app/api/realtycalendar/_lib/syncIcalFeeds.ts` (честный дифф).
Таблицы `sync_runs` нет. В UI `external_source` не читается ни в `ReserveInfo.tsx`,
ни в `useReserveDragMove.ts` → метку зеркала можно двигать/править/удалять, крон молча затрёт.

### Уже сделано — не переделывать
`.github/workflows/sync-alerts.yml` — алерт менеджерам при падении кронов.
**Дополнить:** не ловит частичный сбой (крон «зелёный», часть источников упала), не ловит
тихую порчу (delete прошёл, insert упал), не ловит «данные давно не обновлялись».
После появления `sync_runs` повесить алерт на `status <> 'ok'` и на отсутствие успешного
запуска источника дольше N часов.

### Работы
1. **RPC** `sync_external_occupancy(p_source text, p_room_ids uuid[], p_marks jsonb)`
   (`SECURITY DEFINER`, `set search_path = ''`, вызывается только сервером/кроном):
   одна транзакция + advisory-lock: validate → DELETE меток источника → INSERT новых →
   запись в `sync_runs`. Пересечения с ручными бронями проверять **внутри RPC по ночам**,
   ручные брони **не трогать и не двигать**. Возврат `{inserted, skipped_manual, skipped_past, conflicts}`.
2. **`computePullDownRepack`** (перемещение ручных броней в `syncShelter`) — по правилу
   «ручные не двигать» убрать либо сделать явным и логируемым. **Согласовать с владельцем до кода.**
3. **Таблица `sync_runs`**: id, source, hotel_id, started_at, finished_at,
   status (ok/partial/error), counts jsonb, error text.
4. **Idempotency/concurrency:** advisory-lock; `concurrency: group` в воркфлоу кронов;
   retry с backoff (образец — RealtyCalendar).
5. **`external_source='realtycalendar_webhook'`** проставлять в `webhook/route.ts`.
6. **Read-only внешних броней в UI:** пробросить `external_source` в DTO/форму/календарь;
   `ReserveInfo.tsx` — только чтение + бейдж «Обновляется автоматически, источник: …»;
   `useReserveDragMove.ts` — запретить перетаскивание (сейчас гейт только по `is_fixed`/названию :91-96);
   **override** «Исключить вручную» с обязательной причиной → аудит + флаг, который крон не
   перезатирает. **Модель согласовать до кода.**

### Тест на копии данных (обязателен до прод-мержа)
Дамп `reserves` по 2-3 зеркальным отелям (Лазурит, Джаннат, Аврора) в схему `sync_test`;
прогон новой RPC против сохранённого снимка источника → diff занятости по ночам против старого
пути = 0 (кроме устранённого «окна пустоты»); симуляция сбоя между delete и insert (старый путь
теряет занятость, новый откатывается); проверить, что ручные брони и `manual_belvedere` целы.

**Rollback:** RPC внедряется рядом со старым путём за feature-flag на источник, кроны
переводятся по одному; откат = вернуть флаг.

---

## Этап 5 (P1)

1. **Delete не блокируется при мутации.** `FormButtons.tsx` — `disabled` есть у cancel (:77)
   и submit (:81), у delete нет; `HotelCalendar.tsx:301` — `reserveLoading` не включает
   `isReserveDeleting` (в `Calendar.tsx:318` включает).
2. **Ошибка поиска ≠ «свободных нет».** `hotels/page.tsx`, `hotels/[slug]/page.tsx`,
   `reservation/page.tsx` — `isError`/`refetch` отсутствуют, падение выглядит как пустой список.
3. **Error/retry UI** для списка отелей и страницы отеля (образец — `OperationsCenterPage.tsx:359`).
4. **N+1 деталей отеля.** `hotel.ts:781/793` отдаёт пустые reserves, каждый ряд грузит
   `useHotelDetailQuery` (`reservation/page.tsx:68-71`, per virtual item :504-527);
   серверный N+1 — `hotel.ts:415-426`. → батч-эндпоинт по списку hotelId.
5. **Единый `useScreenSize`.** Три реализации (`useScreenSize.ts`, `useDeviceDetection.ts`,
   локальная в `NavBar.tsx:148`) + мёртвый стор `shared/models/mobile.ts` (`setIsMobile` не
   вызывается → всегда false, читается в `HotelCalendar.tsx:57`). → один хук на `matchMedia`.
6. **Убрать «восстановить с пересечением».** `OperationsCenterPage.tsx:376/398` ставит
   `allowOverlap=true`, `reserve.ts:396` пропускает проверку, но DB-триггер отбивает 23P01 —
   UI обещает то, что БД запрещает. Убрать ветку либо провести через override из Этапа 4.
   Restore сделать атомарным.
7. **Убрать `user-scalable=no`** — `src/app/layout.tsx:43`.
8. **Зависимости** (числа на 18.08): 1 critical + 13 high + 3 moderate + 4 low.
   Обновляемо: `tar`, `next`, `lodash`, `postcss`, `ws`, `sharp`, `js-yaml`, `minimatch`,
   `brace-expansion`, `nanoid`, `immutable`, `flatted`, `picomatch`, `eslint`,
   `@supabase/supabase-js`. **`xlsx` — фикса нет:** заменить на поддерживаемый форк
   (`@e965/xlsx`) либо изолировать парсинг в кроне и не принимать недоверенные файлы.
   `next` обновлять отдельным PR с проверкой сборки.

---

## Перепроверка фактов перед КАЖДЫМ этапом (по ревью, п.4)
Код и БД меняются между этапами — не полагаться на цифры из этого файла.
```bash
git fetch origin && git status -sb          # локальная копия не должна отставать
git log --oneline -10 origin/main
npm audit                                   # актуальные уязвимости и их число
npm run test && npx tsc --noEmit            # базовое здоровье до изменений
```
БД (read-only, через Supabase SQL): политики на целевых таблицах
(`select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname='public'`);
права на функции (`aclexplode(proacl)` по `pg_proc`); `security_invoker` у view;
наличие `booking_night_range`, `user_roles`, `sync_runs`.
Если факт разошёлся с ТЗ — **сначала обновить ТЗ, потом кодить.**

## Смоук-тест ролей (после каждого этапа с RLS)
Три тестовых пользователя (`admin`, `operator`, `hotel`-владелец одного отеля):
- admin / operator: видят и меняют все hotels/rooms/reserves/closures ✓
- hotel: только свои (по `hotels.user_id`); чужие не видит и не меняет ✓
- hotel и operator **не могут**: изменить свою роль в `user_roles`, вставить себе строку,
  подделать `updated_by`
- hotel **не может**: получить непустой `list_assignable_users`; открыть calendar-роут чужого
  отеля с ПДн (403 или маскированный DTO); вызвать `get_raw_user_meta_data` (revoked/удалена)
- anon: ничего из перечисленного; публичный подбор — без ПДн
- нельзя удалить/понизить **последнего** admin

## Порядок этапов
0. **Этап 0** — revoke утечки + временная `list_assignable_users` (v1). Без зависимостей.
1. **Этап 1 (P0-1)** — `user_roles`, `current_app_role()`, триггеры, 12 политик.
2. **Этап 2** — `list_assignable_users` (v2) + drop старой; `security_invoker`; auth и
   маскирование в calendar-роуте (+ ключ кэша).
3. **Этап 3 (P0-4)** — единая ночная семантика (до синка: RPC синка обопрётся на неё).
4. **Этап 4 (P0-3)** — транзакционная RPC, `sync_runs`, read-only внешних, дополнить алерты.
5. **Этап 5 (P1)** — по одному пункту.
