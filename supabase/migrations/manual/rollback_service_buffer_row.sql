-- Откат миграции 20260724_add_service_buffer_row.sql.
--
-- ВНИМАНИЕ: reserves.room_id → ON DELETE CASCADE. Удаление служебной строки
-- уничтожит лежащие в ней брони. Поэтому откат СНАЧАЛА проверяет, что буферы
-- пусты, и прерывается с ошибкой, если в каком-то буфере есть бронь — её нужно
-- вручную перенести в обычный номер, иначе потеряется.
--
-- Применять: Supabase Dashboard → SQL Editor → вставить целиком → Run.

BEGIN;

-- 0) Страховка от потери данных: не откатываемся, пока в буферах есть брони.
DO $$
DECLARE
    parked int;
BEGIN
    SELECT count(*) INTO parked
    FROM public.reserves rz
    JOIN public.rooms rm ON rm.id = rz.room_id
    WHERE rm.is_service = true;

    IF parked > 0 THEN
        RAISE EXCEPTION 'Откат прерван: в служебных строках лежит % бронь(и). Сначала перенесите их в обычные номера.', parked;
    END IF;
END $$;

-- 1) Снимаем защитный триггер (иначе он не даст удалить служебные строки).
DROP TRIGGER IF EXISTS trg_protect_service_room ON public.rooms;
DROP FUNCTION IF EXISTS public.protect_service_room();

-- 2) Удаляем пустые служебные строки.
DELETE FROM public.rooms WHERE is_service = true;

-- 2) Возвращаем функции и view к состоянию до миграции (тексты из
--    20260714_dump_search_rpc_functions.sql — «как было»).
CREATE OR REPLACE FUNCTION public.get_available_hotels(
    start_time bigint DEFAULT NULL::bigint,
    end_time bigint DEFAULT NULL::bigint,
    room_type_filter text DEFAULT NULL::text,
    min_quantity_filter integer DEFAULT NULL::integer,
    city_filter text[] DEFAULT NULL::text[],
    room_features_filter text[] DEFAULT NULL::text[],
    features_filter text[] DEFAULT NULL::text[],
    eat_filter text[] DEFAULT NULL::text[],
    beach_filter text[] DEFAULT NULL::text[],
    beach_distance_filter text[] DEFAULT NULL::text[],
    min_price_filter numeric DEFAULT NULL::numeric,
    max_price_filter numeric DEFAULT NULL::numeric
)
 RETURNS TABLE(hotel_id uuid, hotel_title text, room_type text, rooms json)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    h.id AS hotel_id,
    h.title AS hotel_title,
    r.type AS room_type,
    COALESCE(
      json_agg(
        json_build_object(
          'room_id', r.id,
          'room_title', r.title,
          'room_price', r.price,
          'room_quantity', r.quantity,
          'room_type', r.type
        )
      ) FILTER (WHERE r.id IS NOT NULL),
      '[]'::JSON
    ) AS rooms
  FROM hotels h
  LEFT JOIN rooms r ON h.id = r.hotel_id
  WHERE
    (room_type_filter IS NULL OR r.type = room_type_filter)
    AND (min_quantity_filter IS NULL OR r.quantity >= min_quantity_filter)
    AND (city_filter IS NULL OR h.city = ANY(city_filter))
    AND (room_features_filter IS NULL OR r.room_features @> room_features_filter)
    AND (features_filter IS NULL OR h.features @> features_filter)
    AND (eat_filter IS NULL OR h.eat @> eat_filter)
    AND (beach_filter IS NULL OR h.beach = ANY(beach_filter))
    AND (beach_distance_filter IS NULL OR h.beach_distance = ANY(beach_distance_filter))
    AND (min_price_filter IS NULL OR r.price >= min_price_filter)
    AND (max_price_filter IS NULL OR r.price <= max_price_filter)
    AND (
      start_time IS NULL
      OR end_time IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM reserves
        WHERE reserves.room_id = r.id
          AND reserves.start < end_time
          AND reserves."end" > start_time
      )
    )
  GROUP BY h.id, h.title, r.type;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_hotels_with_free_rooms_in_period(
    start_time bigint,
    end_time bigint
)
 RETURNS TABLE(hotel_id uuid, hotel_title text, free_room_count bigint, rooms json)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    hotels.id AS hotel_id,
    hotels.title AS hotel_title,
    COUNT(free_rooms.room_id) AS free_room_count,
    COALESCE(json_agg(free_rooms), '[]') AS rooms
  FROM hotels
  JOIN rooms ON hotels.id = rooms.hotel_id
  LEFT JOIN reserves ON rooms.id = reserves.room_id
  LEFT JOIN (
    SELECT
      rooms.id AS room_id,
      rooms.title AS room_title,
      rooms.price AS room_price,
      json_agg(reserves.*) FILTER (WHERE reserves.id IS NOT NULL) AS reserves
    FROM rooms
    LEFT JOIN reserves ON rooms.id = reserves.room_id
    WHERE
      reserves.id IS NULL OR
      NOT (
        (reserves.start::BIGINT < end_time AND reserves.end::BIGINT > start_time) OR
        (reserves.start::BIGINT <= start_time AND reserves.end::BIGINT >= end_time) OR
        (start_time <= reserves.start::BIGINT AND end_time >= reserves.end::BIGINT)
      )
    GROUP BY rooms.id
  ) AS free_rooms ON rooms.id = free_rooms.room_id
  WHERE free_rooms.room_id IS NOT NULL
  GROUP BY hotels.id, hotels.title;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_hotel_room_reserve_counts()
 RETURNS TABLE(hotel_count bigint, room_count bigint, reserve_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM hotels) AS hotel_count,
    (SELECT COUNT(*) FROM rooms) AS room_count,
    (SELECT COUNT(*) FROM reserves) AS reserve_count;
END;
$function$;

CREATE OR REPLACE VIEW public.hotels_with_rooms_new AS
 SELECT h.id, h.title, h.type, h.rating, h.address, h.telegram_url, h.phone,
        h.description, h.image_id, h.created_at, h.user_id,
        count(r.id) AS rooms_count
   FROM (hotels h JOIN rooms r ON ((r.hotel_id = h.id)))
  GROUP BY h.id
 HAVING (count(r.id) > 0);

-- 3) Убираем колонку-флаг.
ALTER TABLE public.rooms DROP COLUMN IF EXISTS is_service;

COMMIT;
