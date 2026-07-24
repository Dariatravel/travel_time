-- «Буфер для переноса» — служебная строка-номер в каждом отеле.
--
-- Назначение: дать оператору/отельеру временный «карман», куда можно вручную
-- переложить бронь, когда календарь номера забит и переставить брони местами
-- иначе мешает защита от двойного бронирования (А1). Строка видна в шахматке
-- (последней, отдельным цветом), но НЕ участвует в поиске свободных номеров и
-- НЕ считается в статистике/загрузке отеля. Бронь в буфере — транзит.
--
-- Как применять: Supabase Dashboard → SQL Editor → вставить файл целиком → Run.
-- Откат: supabase/migrations/rollback/20260724_rollback_service_buffer_row.sql.
--
-- Безопасность: колонка добавляется с DEFAULT false (быстрый дефолт PG11+, без
-- переписи таблицы). Вставка идемпотентна (NOT EXISTS) — повторный прогон не
-- плодит дубликаты. Логика поиска для обычных номеров НЕ меняется: во все
-- функции добавлено только условие «исключить служебные строки».

BEGIN;

-- 1) Флаг служебной строки на уровне номера.
ALTER TABLE public.rooms
    ADD COLUMN IF NOT EXISTS is_service boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.rooms.is_service IS
    'Служебная строка «Буфер для переноса»: видна в шахматке, но исключена из поиска и статистики.';

-- 2) По одному буферу на КАЖДЫЙ отель (у кого его ещё нет).
--    image_title/image_path в rooms — NOT NULL без дефолта, поэтому явные ''.
--    order большим значением — как запасной ориентир; фронт всё равно ставит
--    буфер последним по is_service, не полагаясь на order.
INSERT INTO public.rooms (hotel_id, title, price, quantity, image_title, image_path, "order", type, is_service)
SELECT h.id, 'Буфер для переноса', 0, 0, '', '', 30000, 'service', true
FROM public.hotels h
WHERE NOT EXISTS (
    SELECT 1 FROM public.rooms r WHERE r.hotel_id = h.id AND r.is_service = true
);

-- 3) Поиск: основной RPC — исключаем служебные строки.
--    r.is_service IS NOT TRUE сохраняет и отели без номеров (r.id IS NULL → NULL → TRUE).
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
    -- Служебная строка «Буфер для переноса» никогда не участвует в поиске.
    (r.is_service IS NOT TRUE)

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
        FROM reserves
        WHERE reserves.room_id = r.id
          AND reserves.start < end_time
          AND reserves."end" > start_time
      )
    )
  GROUP BY h.id, h.title, r.type;
END;
$function$;

-- 4) Legacy-поиск свободных номеров в периоде — тоже исключаем служебные.
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
      rooms.is_service IS NOT TRUE
      AND (
        reserves.id IS NULL OR
        NOT (
          (reserves.start::BIGINT < end_time AND reserves.end::BIGINT > start_time) OR
          (reserves.start::BIGINT <= start_time AND reserves.end::BIGINT >= end_time) OR
          (start_time <= reserves.start::BIGINT AND end_time >= reserves.end::BIGINT)
        )
      )
    GROUP BY rooms.id
  ) AS free_rooms ON rooms.id = free_rooms.room_id
  WHERE free_rooms.room_id IS NOT NULL
    AND rooms.is_service IS NOT TRUE
  GROUP BY hotels.id, hotels.title;
END;
$function$;

-- 5) Дашбордные счётчики — служебные строки и брони в них не считаем.
CREATE OR REPLACE FUNCTION public.get_hotel_room_reserve_counts()
 RETURNS TABLE(hotel_count bigint, room_count bigint, reserve_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM hotels) AS hotel_count,
    (SELECT COUNT(*) FROM rooms WHERE is_service IS NOT TRUE) AS room_count,
    (SELECT COUNT(*) FROM reserves rz
       JOIN rooms rm ON rm.id = rz.room_id
      WHERE rm.is_service IS NOT TRUE) AS reserve_count;
END;
$function$;

-- 7) Защита служебной строки: её нельзя удалить и переименовать (и снять флаг).
--    Гарантия на уровне БД — не зависит от интерфейса. Обычные UPDATE (без смены
--    названия/флага) разрешены, поэтому сохранение формы без переименования и
--    перенос броней в буфер работают штатно.
CREATE OR REPLACE FUNCTION public.protect_service_room()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_service THEN
            RAISE EXCEPTION 'Служебную строку «Буфер для переноса» удалять нельзя'
                USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.is_service THEN
        IF NEW.title IS DISTINCT FROM OLD.title THEN
            RAISE EXCEPTION 'Служебную строку «Буфер для переноса» переименовывать нельзя'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.is_service IS DISTINCT FROM OLD.is_service THEN
            RAISE EXCEPTION 'Нельзя снять служебный флаг со строки «Буфер для переноса»'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_service_room ON public.rooms;
CREATE TRIGGER trg_protect_service_room
    BEFORE UPDATE OR DELETE ON public.rooms
    FOR EACH ROW EXECUTE FUNCTION public.protect_service_room();

-- 6) Каталог: rooms_count в view не учитывает служебную строку.
CREATE OR REPLACE VIEW public.hotels_with_rooms_new AS
 SELECT h.id,
    h.title,
    h.type,
    h.rating,
    h.address,
    h.telegram_url,
    h.phone,
    h.description,
    h.image_id,
    h.created_at,
    h.user_id,
    count(r.id) FILTER (WHERE r.is_service IS NOT TRUE) AS rooms_count
   FROM (hotels h
     JOIN rooms r ON ((r.hotel_id = h.id)))
  GROUP BY h.id
 HAVING (count(r.id) FILTER (WHERE r.is_service IS NOT TRUE) > 0);

COMMIT;
