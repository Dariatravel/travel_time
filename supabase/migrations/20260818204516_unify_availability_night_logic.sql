-- Stage 3: availability must use the same checkout-night semantics as the
-- database exclusion constraint. A checkout and a check-in on one calendar day
-- therefore do not conflict.

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
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
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
          start_time IS NULL OR end_time IS NULL OR (
              NOT EXISTS (
                  SELECT 1
                  FROM public.reserves AS rz
                  WHERE rz.room_id = r.id
                    AND public.booking_night_range(rz.start, rz."end")
                        && public.booking_night_range(start_time, end_time)
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.room_closures AS rc
                  WHERE rc.room_id = r.id
                    AND public.booking_night_range(rc.start, rc."end")
                        && public.booking_night_range(start_time, end_time)
              )
          )
      )
    GROUP BY h.id, h.title, r.type;
$$;

CREATE OR REPLACE FUNCTION public.get_hotels_with_free_rooms_in_period(
    start_time bigint,
    end_time bigint
)
RETURNS TABLE(hotel_id uuid, hotel_title text, free_room_count bigint, rooms json)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT
        h.id,
        h.title,
        count(r.id)::bigint,
        COALESCE(
            json_agg(
                json_build_object(
                    'room_id', r.id,
                    'room_title', r.title,
                    'room_price', r.price,
                    'reserves', '[]'::json
                )
            ),
            '[]'::json
        )
    FROM public.hotels AS h
    JOIN public.rooms AS r ON r.hotel_id = h.id
    WHERE r.is_service IS NOT TRUE
      AND NOT EXISTS (
          SELECT 1 FROM public.reserves AS rz
          WHERE rz.room_id = r.id
            AND public.booking_night_range(rz.start, rz."end")
                && public.booking_night_range(start_time, end_time)
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.room_closures AS rc
          WHERE rc.room_id = r.id
            AND public.booking_night_range(rc.start, rc."end")
                && public.booking_night_range(start_time, end_time)
      )
    GROUP BY h.id, h.title;
$$;
