-- Карточка объекта (16.09.2026).
--
-- У каждого отеля — одна карточка в АБХАЗБИЗНЕС: описание для гостей,
-- внутреннее (тариф, контакт хозяина, условия), где объект размещён.
-- Дальше из карточки будут собираться сайт, посты и фид Авито; пока —
-- источник для менеджеров и отельера.
--
-- Доступ. Карточку целиком видит и правит только admin (правило: новое —
-- за флагом/для admin). Отельер (роль hotel, hotels.user_id = он) видит
-- ТОЛЬКО публичную часть своего отеля и не правит её напрямую: его правка
-- ложится в draft «на проверку», менеджер подтверждает или отклоняет.
-- Иначе на сайте появились бы чужие телефоны и «бронируйте напрямую».
-- Номера отельер правит сам — RLS на rooms это уже позволяет, и правка
-- сразу видна в шахматке.
--
-- Откат: DROP FUNCTION public.hotelier_cards(), public.hotelier_submit_card(uuid, jsonb),
-- public.hotelier_withdraw_card(uuid), public.approve_card_draft(uuid, timestamptz),
-- public.reject_card_draft(uuid),
-- public.hotel_card_public_keys(); DROP TABLE public.hotel_placements, public.hotel_cards.
BEGIN;

CREATE TABLE IF NOT EXISTS public.hotel_cards (
    hotel_id      uuid PRIMARY KEY REFERENCES public.hotels (id) ON DELETE CASCADE,
    -- Для гостей (публичное; это и правит отельер через проверку)
    summary       text,
    description   text,
    capacity_text text,
    beach_text    text,
    checkin       text,
    checkout      text,
    min_nights    integer CHECK (min_nights IS NULL OR min_nights BETWEEN 1 AND 60),
    kids          text,
    pets          text,
    food          text,
    kitchen       text,
    nearby        text,
    rules         text,
    amenities     text[]      NOT NULL DEFAULT '{}',
    -- Внутреннее (только наша команда)
    tariff        text        NOT NULL DEFAULT 'basic' CHECK (tariff IN ('basic', 'partner', 'exclusive')),
    owner_contact text,
    prepay_terms  text,
    internal_note text,
    checked_at    date,
    -- Правка отельера на проверке
    draft         jsonb,
    draft_at      timestamptz,
    draft_by      uuid,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    text
);

-- Где объект размещён: то, что сейчас в Google-листе СОЦСЕТИ.
CREATE TABLE IF NOT EXISTS public.hotel_placements (
    hotel_id   uuid        NOT NULL REFERENCES public.hotels (id) ON DELETE CASCADE,
    channel    text        NOT NULL CHECK (channel IN (
                   'site', 'telegram', 'avito', 'max', 'vk', 'dzen', 'yandex_map', 'gis2', 'google_map')),
    status     text        NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'outdated', 'missing')),
    url        text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text,
    PRIMARY KEY (hotel_id, channel)
);

ALTER TABLE public.hotel_cards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_placements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotel_cards_admin_all ON public.hotel_cards;
CREATE POLICY hotel_cards_admin_all ON public.hotel_cards FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
DROP POLICY IF EXISTS hotel_placements_admin_all ON public.hotel_placements;
CREATE POLICY hotel_placements_admin_all ON public.hotel_placements FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

REVOKE ALL ON public.hotel_cards, public.hotel_placements FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_cards, public.hotel_placements TO authenticated;

/** Публичные поля карточки — единственное, что отельер видит и может предложить изменить. */
CREATE OR REPLACE FUNCTION public.hotel_card_public_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT ARRAY['summary', 'description', 'capacity_text', 'beach_text', 'checkin', 'checkout',
                 'min_nights', 'kids', 'pets', 'food', 'kitchen', 'nearby', 'rules', 'amenities']
$$;

/**
 * Карточки отельера: его отели с публичной частью карточки и его правкой
 * на проверке. Внутренние поля не отдаются. Admin видит все — для проверки.
 */
CREATE OR REPLACE FUNCTION public.hotelier_cards()
RETURNS TABLE (
    hotel_id      uuid,
    title         text,
    city          text,
    address       text,
    phone         text,
    summary       text,
    description   text,
    capacity_text text,
    beach_text    text,
    checkin       text,
    checkout      text,
    min_nights    integer,
    kids          text,
    pets          text,
    food          text,
    kitchen       text,
    nearby        text,
    rules         text,
    amenities     text[],
    draft         jsonb,
    draft_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT h.id, h.title, h.city, h.address, h.phone,
           c.summary, c.description, c.capacity_text, c.beach_text, c.checkin, c.checkout,
           c.min_nights, c.kids, c.pets, c.food, c.kitchen, c.nearby, c.rules,
           COALESCE(c.amenities, '{}'), c.draft, c.draft_at
      FROM public.hotels AS h
      LEFT JOIN public.hotel_cards AS c ON c.hotel_id = h.id
     WHERE (public.current_app_role() = 'hotel' AND h.user_id = auth.uid())
        OR public.current_app_role() = 'admin'
     ORDER BY h.title
$$;

REVOKE ALL ON FUNCTION public.hotelier_cards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hotelier_cards() TO authenticated;

/**
 * Отельер предлагает правку публичной части своего отеля. Ключи вне
 * публичного списка отбрасываются, тексты режутся до 4000 знаков,
 * min_nights — только целое 1..60, amenities — до 30 строк по 60 знаков.
 * Правка не публикуется: ждёт подтверждения менеджера. Возвращает число
 * принятых полей.
 */
CREATE OR REPLACE FUNCTION public.hotelier_submit_card(p_hotel uuid, p_draft jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role  text := public.current_app_role();
    v_clean jsonb := '{}'::jsonb;
    v_key   text;
    v_val   jsonb;
    v_text  text;
BEGIN
    IF v_role IS NULL OR v_role NOT IN ('hotel', 'admin') THEN
        RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.hotels AS h
         WHERE h.id = p_hotel AND (h.user_id = auth.uid() OR v_role = 'admin')
    ) THEN
        RAISE EXCEPTION 'Это не ваш отель' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_draft) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Ожидался объект с полями карточки';
    END IF;

    FOR v_key, v_val IN SELECT key, value FROM jsonb_each(p_draft) LOOP
        IF NOT (v_key = ANY (public.hotel_card_public_keys())) THEN
            CONTINUE;
        END IF;
        IF v_key = 'min_nights' THEN
            IF jsonb_typeof(v_val) = 'null' THEN
                v_clean := v_clean || jsonb_build_object(v_key, NULL);
            ELSIF jsonb_typeof(v_val) = 'number' AND (v_val #>> '{}') ~ '^[1-9][0-9]?$'
                  AND (v_val #>> '{}')::integer BETWEEN 1 AND 60 THEN
                v_clean := v_clean || jsonb_build_object(v_key, (v_val #>> '{}')::integer);
            END IF;
        ELSIF v_key = 'amenities' THEN
            IF jsonb_typeof(v_val) = 'array' THEN
                -- Только строки, без пустых, не больше 30 — фильтр ДО лимита.
                v_clean := v_clean || jsonb_build_object(v_key, (
                    SELECT COALESCE(jsonb_agg(x.t), '[]'::jsonb)
                      FROM (SELECT left(btrim(e #>> '{}'), 60) AS t
                              FROM jsonb_array_elements(v_val) AS e
                             WHERE jsonb_typeof(e) = 'string' AND btrim(e #>> '{}') <> ''
                             LIMIT 30) AS x));
            END IF;
        ELSIF jsonb_typeof(v_val) = 'null' THEN
            v_clean := v_clean || jsonb_build_object(v_key, NULL);
        ELSIF jsonb_typeof(v_val) = 'string' THEN
            v_text := NULLIF(btrim(v_val #>> '{}'), '');
            v_clean := v_clean || jsonb_build_object(v_key, left(v_text, 4000));
        END IF;
    END LOOP;

    IF v_clean = '{}'::jsonb THEN
        RETURN 0;
    END IF;

    INSERT INTO public.hotel_cards AS c (hotel_id, draft, draft_at, draft_by)
    VALUES (p_hotel, v_clean, now(), auth.uid())
    ON CONFLICT (hotel_id) DO UPDATE
       SET draft = v_clean, draft_at = now(), draft_by = auth.uid();

    RETURN (SELECT count(*) FROM jsonb_object_keys(v_clean));
END;
$$;

REVOKE ALL ON FUNCTION public.hotelier_submit_card(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hotelier_submit_card(uuid, jsonb) TO authenticated;

/** Отельер отзывает свою правку, пока менеджер её не проверил. */
CREATE OR REPLACE FUNCTION public.hotelier_withdraw_card(p_hotel uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text := public.current_app_role();
    n integer;
BEGIN
    IF v_role IS NULL OR v_role NOT IN ('hotel', 'admin') THEN
        RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
    END IF;

    UPDATE public.hotel_cards AS c
       SET draft = NULL, draft_at = NULL, draft_by = NULL
     WHERE c.hotel_id = p_hotel
       AND c.draft IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.hotels AS h
                    WHERE h.id = p_hotel AND (h.user_id = auth.uid() OR v_role = 'admin'));

    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.hotelier_withdraw_card(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hotelier_withdraw_card(uuid) TO authenticated;

/**
 * Менеджер подтверждает правку отельера: поля из draft переносятся в карточку.
 * p_draft_at — время правки, которую менеджер видел на экране: если отельер
 * успел прислать новую, ничего не переносится (0) — нельзя принять невиденное.
 */
CREATE OR REPLACE FUNCTION public.approve_card_draft(p_hotel uuid, p_draft_at timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    n integer;
BEGIN
    IF public.current_app_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
    END IF;

    UPDATE public.hotel_cards AS c
       SET summary       = CASE WHEN c.draft ? 'summary'       THEN c.draft ->> 'summary'       ELSE c.summary       END,
           description   = CASE WHEN c.draft ? 'description'   THEN c.draft ->> 'description'   ELSE c.description   END,
           capacity_text = CASE WHEN c.draft ? 'capacity_text' THEN c.draft ->> 'capacity_text' ELSE c.capacity_text END,
           beach_text    = CASE WHEN c.draft ? 'beach_text'    THEN c.draft ->> 'beach_text'    ELSE c.beach_text    END,
           checkin       = CASE WHEN c.draft ? 'checkin'       THEN c.draft ->> 'checkin'       ELSE c.checkin       END,
           checkout      = CASE WHEN c.draft ? 'checkout'      THEN c.draft ->> 'checkout'      ELSE c.checkout      END,
           min_nights    = CASE WHEN c.draft ? 'min_nights'    THEN (c.draft ->> 'min_nights')::integer ELSE c.min_nights END,
           kids          = CASE WHEN c.draft ? 'kids'          THEN c.draft ->> 'kids'          ELSE c.kids          END,
           pets          = CASE WHEN c.draft ? 'pets'          THEN c.draft ->> 'pets'          ELSE c.pets          END,
           food          = CASE WHEN c.draft ? 'food'          THEN c.draft ->> 'food'          ELSE c.food          END,
           kitchen       = CASE WHEN c.draft ? 'kitchen'       THEN c.draft ->> 'kitchen'       ELSE c.kitchen       END,
           nearby        = CASE WHEN c.draft ? 'nearby'        THEN c.draft ->> 'nearby'        ELSE c.nearby        END,
           rules         = CASE WHEN c.draft ? 'rules'         THEN c.draft ->> 'rules'         ELSE c.rules         END,
           amenities     = CASE WHEN c.draft ? 'amenities'
                                THEN ARRAY(SELECT jsonb_array_elements_text(c.draft -> 'amenities'))
                                ELSE c.amenities END,
           draft = NULL, draft_at = NULL, draft_by = NULL,
           updated_at = now(), updated_by = 'проверка правки отельера'
     WHERE c.hotel_id = p_hotel
       AND c.draft IS NOT NULL
       AND (p_draft_at IS NULL OR c.draft_at = p_draft_at);

    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

/** Менеджер отклоняет правку отельера: карточка не меняется. */
CREATE OR REPLACE FUNCTION public.reject_card_draft(p_hotel uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    n integer;
BEGIN
    IF public.current_app_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
    END IF;

    UPDATE public.hotel_cards AS c
       SET draft = NULL, draft_at = NULL, draft_by = NULL
     WHERE c.hotel_id = p_hotel AND c.draft IS NOT NULL;

    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_card_draft(uuid, timestamptz), public.reject_card_draft(uuid),
    public.hotel_card_public_keys() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_card_draft(uuid, timestamptz), public.reject_card_draft(uuid),
    public.hotel_card_public_keys() TO authenticated;

COMMIT;
