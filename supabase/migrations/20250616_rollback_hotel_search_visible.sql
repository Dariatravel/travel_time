-- Откат: убрать флаг видимости в поиске (вернуть поведение «все отели в поиске»).

ALTER TABLE public.hotels
DROP COLUMN IF EXISTS is_search_visible;
