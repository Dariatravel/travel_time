-- Признак ручной фиксации брони в шахматке.
-- Используется для тестового авторазмещения в отеле «ПРОБНЫЙ».

ALTER TABLE public.reserves
    ADD COLUMN IF NOT EXISTS is_fixed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.reserves.is_fixed IS
    'true = бронь нельзя автоматически или вручную перемещать между номерами';
