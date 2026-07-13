-- Запрет двойного бронирования на уровне базы данных.
--
-- Как применять: Supabase Dashboard -> SQL Editor -> вставить файл целиком -> Run.
-- Миграция безопасна при существующих пересечениях броней: на reserves ставится
-- триггер-защита (проверяет только НОВЫЕ вставки и переносы), а не exclusion
-- constraint. Жёсткий constraint на reserves лежит отдельно в
-- supabase/migrations/manual/reserves_exclusion_after_cleanup.sql и применяется
-- только после ручной чистки исторических пересечений (на 13.07.2026 их 483,
-- отчёт: travel_time_конфликты_броней.md).
--
-- Семантика пересечения повторяет приложение (hasReserveNightOverlap в
-- src/shared/api/reserve/reserve.ts): сравниваются индексы суток
-- floor(unix / 86400), поэтому «выезд 12:00 / заезд 14:00 в один день» не
-- считается конфликтом. Проверено на данных: 123 стыковые пары броней легальны
-- именно благодаря подсчёту по ночам.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Диапазон занятых ночей: полуоткрытый интервал индексов суток по UTC.
-- Для стандартных моcковских 14:00/12:00 граница суток безопасна (09:00/11:00 UTC).
CREATE OR REPLACE FUNCTION public.booking_night_range(start_unix bigint, end_unix bigint)
RETURNS int8range
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT int8range(start_unix / 86400, end_unix / 86400);
$$;

-- ---------------------------------------------------------------------------
-- 1) room_closures: пересечений в данных нет, поэтому сразу жёсткий constraint.
-- ---------------------------------------------------------------------------

ALTER TABLE public.room_closures
    DROP CONSTRAINT IF EXISTS room_closures_no_overlap;

ALTER TABLE public.room_closures
    ADD CONSTRAINT room_closures_no_overlap
    EXCLUDE USING gist (
        room_id WITH =,
        public.booking_night_range(start, "end") WITH &&
    );

-- ---------------------------------------------------------------------------
-- 2) Триггер-защита от гонок для reserves (и кросс-проверка бронь <-> закрытие).
--
-- Почему триггер, а не EXCLUDE: exclusion constraint не поддерживает NOT VALID
-- и не применится, пока в таблице есть исторические пересечения.
--
-- Гарантия от гонки: pg_advisory_xact_lock сериализует изменения календаря
-- одного номера. Вторая транзакция ждёт коммита первой, а в READ COMMITTED
-- (дефолт Supabase) её SELECT после снятия блокировки видит уже закоммиченные
-- строки конкурента. Две одновременные вставки пересекающихся броней ->
-- вторая получает ошибку 23P01, каким бы путём она ни пришла
-- (клиент -> Supabase, прокси-роут, вебхук RealtyCalendar, iCal-синк).
--
-- SECURITY DEFINER: проверка должна видеть все брони номера независимо от RLS
-- текущего пользователя.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_room_calendar_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    conflict record;
    new_range int8range;
BEGIN
    IF NEW."end" < NEW.start THEN
        RAISE EXCEPTION 'Некорректный период: конец раньше начала'
            USING ERRCODE = '23514';
    END IF;

    new_range := public.booking_night_range(NEW.start, NEW."end");

    IF isempty(new_range) THEN
        RETURN NEW; -- бронь без ночей ни с чем не конфликтует (как в приложении)
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('room_calendar:' || NEW.room_id::text, 0)
    );

    SELECT r.id, r.guest, r.start, r."end"
      INTO conflict
      FROM public.reserves r
     WHERE r.room_id = NEW.room_id
       AND (TG_TABLE_NAME <> 'reserves' OR r.id <> NEW.id)
       AND r."end" >= r.start
       AND public.booking_night_range(r.start, r."end") && new_range
     ORDER BY r.start
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Наложение броней запрещено. Конфликт: %: % - %',
            COALESCE(NULLIF(conflict.guest, ''), 'Без имени'),
            to_char(to_timestamp(conflict.start) AT TIME ZONE 'UTC', 'DD.MM.YYYY'),
            to_char(to_timestamp(conflict."end") AT TIME ZONE 'UTC', 'DD.MM.YYYY')
            USING ERRCODE = '23P01';
    END IF;

    SELECT c.id, c.start, c."end"
      INTO conflict
      FROM public.room_closures c
     WHERE c.room_id = NEW.room_id
       AND (TG_TABLE_NAME <> 'room_closures' OR c.id <> NEW.id)
       AND c."end" >= c.start
       AND public.booking_night_range(c.start, c."end") && new_range
     ORDER BY c.start
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'На выбранные даты уже есть закрытие номера: % - %',
            to_char(to_timestamp(conflict.start) AT TIME ZONE 'UTC', 'DD.MM.YYYY'),
            to_char(to_timestamp(conflict."end") AT TIME ZONE 'UTC', 'DD.MM.YYYY')
            USING ERRCODE = '23P01';
    END IF;

    RETURN NEW;
END;
$$;

-- INSERT проверяется всегда; UPDATE — только при изменении номера или дат,
-- чтобы исторические пересечения не блокировали редактирование остальных
-- полей (гость, телефон, цена, комментарий).

DROP TRIGGER IF EXISTS reserves_guard_overlap_insert ON public.reserves;
CREATE TRIGGER reserves_guard_overlap_insert
    BEFORE INSERT ON public.reserves
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_room_calendar_overlap();

DROP TRIGGER IF EXISTS reserves_guard_overlap_update ON public.reserves;
CREATE TRIGGER reserves_guard_overlap_update
    BEFORE UPDATE ON public.reserves
    FOR EACH ROW
    WHEN (
        OLD.room_id IS DISTINCT FROM NEW.room_id
        OR OLD.start IS DISTINCT FROM NEW.start
        OR OLD."end" IS DISTINCT FROM NEW."end"
    )
    EXECUTE FUNCTION public.guard_room_calendar_overlap();

DROP TRIGGER IF EXISTS room_closures_guard_overlap_insert ON public.room_closures;
CREATE TRIGGER room_closures_guard_overlap_insert
    BEFORE INSERT ON public.room_closures
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_room_calendar_overlap();

DROP TRIGGER IF EXISTS room_closures_guard_overlap_update ON public.room_closures;
CREATE TRIGGER room_closures_guard_overlap_update
    BEFORE UPDATE ON public.room_closures
    FOR EACH ROW
    WHEN (
        OLD.room_id IS DISTINCT FROM NEW.room_id
        OR OLD.start IS DISTINCT FROM NEW.start
        OR OLD."end" IS DISTINCT FROM NEW."end"
    )
    EXECUTE FUNCTION public.guard_room_calendar_overlap();

-- Ускоряет проверку пересечений (и все выборки броней по номеру):
-- FK reserves.room_id индекса сам по себе не создаёт.
CREATE INDEX IF NOT EXISTS reserves_room_id_start_idx
    ON public.reserves (room_id, start);

COMMIT;
