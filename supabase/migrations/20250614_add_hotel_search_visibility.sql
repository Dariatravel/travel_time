-- Позволяет оставлять отель во вкладке «Отели», но скрывать его из поиска свободных дат.

ALTER TABLE public.hotels
    ADD COLUMN IF NOT EXISTS is_search_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.hotels.is_search_visible IS
    'false = скрытый отель: не показывается в поиске свободных дат, но остается во вкладке Отели';
