-- Откат скрытия отелей из поиска.
-- Внимание: удаляет признак скрытости у всех отелей.

ALTER TABLE public.hotels
    DROP COLUMN IF EXISTS is_search_visible;
