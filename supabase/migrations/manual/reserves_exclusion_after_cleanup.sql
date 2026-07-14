-- ЖЁСТКИЙ exclusion constraint на reserves.
--
-- НЕ ПРИМЕНЯТЬ, пока в базе остаются исторические пересечения броней:
-- constraint строит индекс по всем строкам и упадёт на первом конфликте.
-- Сначала разберите конфликты по отчёту travel_time_конфликты_броней.md
-- (на 13.07.2026 их 483), затем прогоните проверку ниже — она должна вернуть
-- 0 строк — и только после этого применяйте constraint.
--
-- Требует уже применённой миграции 20260713_prevent_double_booking.sql
-- (функция booking_night_range и расширение btree_gist).
--
-- Триггерная защита из основной миграции остаётся: она даёт понятные русские
-- сообщения об ошибке и кросс-проверку с закрытиями; constraint — страховка
-- на уровне схемы.

-- Шаг 1. Проверка: список оставшихся пересечений «по ночам» (должно быть пусто).
SELECT
    a.id AS reserve_a,
    b.id AS reserve_b,
    a.room_id,
    a.guest AS guest_a,
    b.guest AS guest_b,
    to_char(to_timestamp(a.start) AT TIME ZONE 'UTC', 'DD.MM.YYYY') AS a_start,
    to_char(to_timestamp(a."end") AT TIME ZONE 'UTC', 'DD.MM.YYYY') AS a_end,
    to_char(to_timestamp(b.start) AT TIME ZONE 'UTC', 'DD.MM.YYYY') AS b_start,
    to_char(to_timestamp(b."end") AT TIME ZONE 'UTC', 'DD.MM.YYYY') AS b_end
FROM public.reserves a
JOIN public.reserves b
  ON a.room_id = b.room_id
 AND a.id < b.id
 AND public.booking_night_range(a.start, a."end")
     && public.booking_night_range(b.start, b."end")
ORDER BY a.room_id, a.start;

-- Шаг 2. Применять ТОЛЬКО когда шаг 1 вернул 0 строк:
--
-- ALTER TABLE public.reserves
--     ADD CONSTRAINT reserves_no_overlap
--     EXCLUDE USING gist (
--         room_id WITH =,
--         public.booking_night_range(start, "end") WITH &&
--     );
