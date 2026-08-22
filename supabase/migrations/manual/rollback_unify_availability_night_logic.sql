-- Rollback for 20260818204516_unify_availability_night_logic.sql.
-- The original RPC bodies below were captured from production before rollout.

BEGIN;

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
AS $$
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
            '[]'::json
        ) AS rooms
    FROM public.hotels AS h
    LEFT JOIN public.rooms AS r ON h.id = r.hotel_id
    WHERE r.is_service IS NOT TRUE
      AND (room_type_filter IS NULL OR r.type = room_type_filter)
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
              FROM public.reserves AS rz
              WHERE rz.room_id = r.id
                AND rz.start < end_time
                AND rz."end" > start_time
          )
      )
    GROUP BY h.id, h.title, r.type;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_hotels_with_free_rooms_in_period(
    start_time bigint,
    end_time bigint
)
RETURNS TABLE(hotel_id uuid, hotel_title text, free_room_count bigint, rooms json)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        hotels.id AS hotel_id,
        hotels.title AS hotel_title,
        COUNT(free_rooms.room_id) AS free_room_count,
        COALESCE(json_agg(free_rooms), '[]') AS rooms
    FROM public.hotels
    JOIN public.rooms ON hotels.id = rooms.hotel_id
    LEFT JOIN public.reserves ON rooms.id = reserves.room_id
    LEFT JOIN (
        SELECT
            rooms.id AS room_id,
            rooms.title AS room_title,
            rooms.price AS room_price,
            json_agg(reserves.*) FILTER (WHERE reserves.id IS NOT NULL) AS reserves
        FROM public.rooms
        LEFT JOIN public.reserves ON rooms.id = reserves.room_id
        WHERE rooms.is_service IS NOT TRUE
          AND (
              reserves.id IS NULL
              OR NOT (
                  (reserves.start::bigint < end_time AND reserves."end" > start_time)
                  OR (reserves.start::bigint <= start_time AND reserves."end" >= end_time)
                  OR (start_time <= reserves.start::bigint AND end_time >= reserves."end"::bigint)
              )
          )
        GROUP BY rooms.id
    ) AS free_rooms ON rooms.id = free_rooms.room_id
    WHERE free_rooms.room_id IS NOT NULL
      AND rooms.is_service IS NOT TRUE
    GROUP BY hotels.id, hotels.title;
END;
$$;

-- Реестр создаётся скриптом выкатки. При ручном откате его может не быть,
-- поэтому чистим запись только если таблица существует — иначе весь откат
-- падал бы уже после восстановления функций и не применялся вовсе.
DO $ledger$
BEGIN
    IF to_regclass('app_private.deployment_migrations') IS NOT NULL THEN
        DELETE FROM app_private.deployment_migrations
        WHERE name = 'supabase/migrations/20260818204516_unify_availability_night_logic.sql';
    END IF;
END
$ledger$;

COMMIT;
