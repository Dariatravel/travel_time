-- Безопасное добавление флага видимости отеля в поиске.
-- DEFAULT true: все существующие отели остаются в поиске до ручного скрытия.

ALTER TABLE public.hotels
ADD COLUMN IF NOT EXISTS is_search_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.hotels.is_search_visible IS
    'false = отель скрыт из поиска свободных дат, но остаётся в админке и шахматке';
