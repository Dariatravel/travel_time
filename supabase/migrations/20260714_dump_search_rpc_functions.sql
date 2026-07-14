-- Выгрузка существующих RPC-функций из базы под контроль версий (задача А2).
--
-- Эти функции жили только в Supabase (Dashboard → SQL Editor) и не имели копии
-- в репозитории — их случайное изменение или удаление ломало поиск без следов
-- в git. Тексты сняты через pg_get_functiondef 14.07.2026 «как есть», логика
-- НЕ менялась, чтобы поведение поиска осталось прежним (критерий приёмки А2).
--
-- Замечания по логике (для будущих правок, ничего не трогаем в этой миграции):
--   * get_available_hotels — основной путь поиска. Пересечение брони считается
--     по сырым секундам (reserves.start < end_time AND reserves."end" > start_time),
--     а не «по ночам» floor(unix/86400), как в остальном коде (см.
--     hasReserveNightOverlap). На практике совпадает, потому что границы
--     формируются на 14:00/12:00 МСК, но при иных часах расчёт разойдётся.
--   * Обе поисковые функции игнорируют вместимость номера (quantity) и
--     room_closures — сейчас закрытия и скрытые отели фильтруются отдельными
--     запросами уже после RPC (getClosedRoomIdsForPeriod, is_search_visible).
--   * get_raw_user_meta_data — SECURITY DEFINER, отдаёт raw_user_meta_data всех
--     пользователей auth.users (email/роль) любому вызывающему; вызывается в
--     src/shared/api/auth/auth.ts. Ограничение доступа — вопрос владельца,
--     здесь только фиксируем текущее состояние.

-- get_available_hotels — поиск отелей со свободными номерами по всем фильтрам.
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
    -- Фильтр по типу номера (ранее фильтровали по h.type)
    (room_type_filter IS NULL OR r.type = room_type_filter)

    -- Фильтр по минимальной вместимости
    AND (min_quantity_filter IS NULL OR r.quantity >= min_quantity_filter)

    -- Фильтр по городу (строка)
    AND (city_filter IS NULL OR h.city = ANY(city_filter))

    -- Фильтр по особенностям номера - номер должен содержать ВСЕ выбранные особенности
    AND (room_features_filter IS NULL OR r.room_features @> room_features_filter)

    -- Фильтр по особенностям размещения - отель должен содержать ВСЕ выбранные особенности
    AND (features_filter IS NULL OR h.features @> features_filter)

    -- Фильтр по питанию - отель должен содержать ВСЕ выбранные типы питания
    AND (eat_filter IS NULL OR h.eat @> eat_filter)

    -- Фильтр по типу пляжа (строка = ANY(массив))
    AND (beach_filter IS NULL OR h.beach = ANY(beach_filter))

    -- Фильтр по расстоянию до пляжа (строка = ANY(массив))
    AND (beach_distance_filter IS NULL OR h.beach_distance = ANY(beach_distance_filter))

    -- Фильтр по цене номера
    AND (min_price_filter IS NULL OR r.price >= min_price_filter)
    AND (max_price_filter IS NULL OR r.price <= max_price_filter)

    -- Фильтр по датам
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

-- get_hotels_with_free_rooms_in_period — упрощённый поиск свободных номеров
-- в периоде (устаревшая ветка, используется через grpc-совместимый слой).
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
    COUNT(free_rooms.room_id) AS free_room_count, -- Считаем количество свободных номеров
    COALESCE(json_agg(free_rooms), '[]') AS rooms -- Агрегируем данные о номерах
  FROM hotels
  JOIN rooms ON hotels.id = rooms.hotel_id
  LEFT JOIN reserves ON rooms.id = reserves.room_id
  LEFT JOIN (
    -- Подзапрос для получения только свободных номеров
    SELECT
      rooms.id AS room_id,
      rooms.title AS room_title,
      rooms.price AS room_price,
      json_agg(reserves.*) FILTER (WHERE reserves.id IS NOT NULL) AS reserves -- Агрегируем брони
    FROM rooms
    LEFT JOIN reserves ON rooms.id = reserves.room_id
    WHERE
      reserves.id IS NULL OR -- Нет броней для номера
      NOT (
        -- Бронь не пересекается с заданным периодом
        (reserves.start::BIGINT < end_time AND reserves.end::BIGINT > start_time) OR
        (reserves.start::BIGINT <= start_time AND reserves.end::BIGINT >= end_time) OR
        (start_time <= reserves.start::BIGINT AND end_time >= reserves.end::BIGINT)
      )
    GROUP BY rooms.id
  ) AS free_rooms ON rooms.id = free_rooms.room_id
  WHERE free_rooms.room_id IS NOT NULL -- Только отели с хотя бы одним свободным номером
  GROUP BY hotels.id, hotels.title;
END;
$function$;

-- get_hotel_room_reserve_counts — сводные счётчики для дашборда.
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

-- get_raw_user_meta_data — метаданные всех пользователей (роль/email) для UI.
-- ВНИМАНИЕ: SECURITY DEFINER + чтение auth.users без фильтра по вызывающему.
CREATE OR REPLACE FUNCTION public.get_raw_user_meta_data()
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT raw_user_meta_data
    FROM auth.users;
END;
$function$;
