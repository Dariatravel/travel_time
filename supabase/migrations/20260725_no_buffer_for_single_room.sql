-- ПРАВИЛО: в отелях/квартирах с ОДНИМ номером служебная строка «Буфер для
-- переноса» не нужна — переставлять внутри нечего. Убираем буферы у всех
-- одно-номерных отелей и фиксируем правило на будущее.
--
-- Как применять: Supabase Dashboard → SQL Editor → вставить целиком → Run.
-- Безопасно: удаляем только пустые буферы (без броней). Защитный триггер
-- на время удаления снимаем и тут же возвращаем (одна транзакция).
--
-- Правило действует и для миграции 20260724_add_service_buffer_row.sql —
-- её INSERT ограничен отелями с >1 реальным номером (см. комментарий там).

BEGIN;

-- Триггер protect_service_room запрещает удалять служебные строки — снимаем
-- его в этой транзакции, чтобы убрать буферы, и сразу возвращаем.
DROP TRIGGER IF EXISTS trg_protect_service_room ON public.rooms;

DELETE FROM public.rooms buf
WHERE buf.is_service = true
  AND (
      SELECT count(*)
      FROM public.rooms r
      WHERE r.hotel_id = buf.hotel_id AND r.is_service IS NOT TRUE
  ) <= 1
  -- страховка: не трогаем буфер, если в нём вдруг оказалась бронь
  AND NOT EXISTS (SELECT 1 FROM public.reserves z WHERE z.room_id = buf.id);

CREATE TRIGGER trg_protect_service_room
    BEFORE UPDATE OR DELETE ON public.rooms
    FOR EACH ROW EXECUTE FUNCTION public.protect_service_room();

COMMIT;
