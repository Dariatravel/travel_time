-- ОТКАТ миграции 20260713_prevent_double_booking.sql.
--
-- Полностью снимает защиту от двойного бронирования, добавленную основной
-- миграцией: триггеры на reserves и room_closures, функцию-guard, exclusion
-- constraint на room_closures. Возвращает базу в состояние ДО применения А1.
--
-- Что НЕ трогает намеренно:
--   * booking_night_range — вспомогательная IMMUTABLE-функция, безвредна и
--     может использоваться другими объектами; удаление закомментировано ниже.
--   * reserves_room_id_start_idx — индекс только ускоряет запросы, вреда нет;
--     удаление закомментировано ниже.
-- Раскомментируйте эти строки, только если нужно вернуть схему совсем дословно.
--
-- Применять: Supabase Dashboard -> SQL Editor -> вставить целиком -> Run.

BEGIN;

DROP TRIGGER IF EXISTS reserves_guard_overlap_insert ON public.reserves;
DROP TRIGGER IF EXISTS reserves_guard_overlap_update ON public.reserves;
DROP TRIGGER IF EXISTS room_closures_guard_overlap_insert ON public.room_closures;
DROP TRIGGER IF EXISTS room_closures_guard_overlap_update ON public.room_closures;

DROP FUNCTION IF EXISTS public.guard_room_calendar_overlap();

ALTER TABLE public.room_closures
    DROP CONSTRAINT IF EXISTS room_closures_no_overlap;

-- Если ставили жёсткий constraint на reserves из
-- reserves_exclusion_after_cleanup.sql — снять и его:
ALTER TABLE public.reserves
    DROP CONSTRAINT IF EXISTS reserves_no_overlap;

-- Дословный откат (обычно не нужен):
-- DROP FUNCTION IF EXISTS public.booking_night_range(bigint, bigint);
-- DROP INDEX IF EXISTS public.reserves_room_id_start_idx;

COMMIT;
