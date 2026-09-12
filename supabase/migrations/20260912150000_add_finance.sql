-- Финансы с отелями (этап 4 единой программы, 12.09.2026).
--
-- Что хранится: условия по каждому отелю (как делится предоплата), реквизиты
-- отеля, факты выплат отелю и ручные корректировки «мы должны отелю /
-- отель должен нам» (это единственное, что умел backoffice справочника
-- ABHAZBEREG-INFO — переносится как есть). Сами расчёты по броням не
-- хранятся: они считаются из reserves + booking_cards + deals + hotel_terms
-- на лету (src/features/Finance/lib/finance.ts), поэтому правка брони сразу
-- меняет ведомость. Долг возникает по выезду гостя; учёт ведётся с даты
-- finance_settings.accounting_start (до неё расчёты закрыты руками в OKO).
--
-- Записи о деньгах не удаляются физически — только помечаются (deleted_at),
-- чтобы след оставался.
--
-- Доступ на старте — только admin (решение Дарьи: финансы сначала только у неё).
-- Кабинет отельера — следующим шагом отдельными политиками для роли hotel.
--
-- Полный откат: DROP TABLE public.finance_adjustments, public.hotel_payouts,
-- public.hotel_payment_details, public.hotel_terms, public.finance_settings;
-- папки src/features/Finance, src/app/main/finance.
BEGIN;

CREATE TABLE IF NOT EXISTS public.finance_settings (
    key        text        PRIMARY KEY,
    value      text        NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text
);

INSERT INTO public.finance_settings (key, value) VALUES ('accounting_start', '2026-09-14')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.hotel_terms (
    hotel_id               uuid        PRIMARY KEY REFERENCES public.hotels (id) ON DELETE CASCADE,
    -- prepay_is_fee: вся предоплата — наша услуга бронирования, отелю от нас ничего
    -- share_pct: отелю уходит hotel_share_pct % предоплаты
    -- fixed_per_booking / fixed_per_night: мы оставляем себе фикс, остальное отелю
    model                  text        NOT NULL DEFAULT 'prepay_is_fee'
                                       CHECK (model IN ('prepay_is_fee', 'share_pct', 'fixed_per_booking', 'fixed_per_night')),
    hotel_share_pct        numeric(5,2) CHECK (hotel_share_pct IS NULL OR (hotel_share_pct >= 0 AND hotel_share_pct <= 100)),
    fixed_amount           numeric(12,2) CHECK (fixed_amount IS NULL OR fixed_amount >= 0),
    -- доверенные отели: клиент платит предоплату сразу отелю, отель должен нам нашу долю
    prepay_direct_to_hotel boolean     NOT NULL DEFAULT false,
    payout_period          text        NOT NULL DEFAULT 'week' CHECK (payout_period IN ('week', 'month')),
    min_nights             integer     CHECK (min_nights IS NULL OR min_nights > 0),
    deposit_note           text,       -- «Депозит» из справочника: свободный текст
    note                   text,
    updated_at             timestamptz NOT NULL DEFAULT now(),
    updated_by             text,
    CONSTRAINT hotel_terms_model_fields CHECK (
        (model <> 'share_pct' OR hotel_share_pct IS NOT NULL)
        AND (model NOT IN ('fixed_per_booking', 'fixed_per_night') OR fixed_amount IS NOT NULL)
    )
);

-- Реквизиты отеля — отдельно от карточки отеля («КУДА ДЕНЬГИ СКИДЫВАТЬ» из справочника).
CREATE TABLE IF NOT EXISTS public.hotel_payment_details (
    hotel_id   uuid        PRIMARY KEY REFERENCES public.hotels (id) ON DELETE CASCADE,
    bank       text,
    holder     text,
    requisites text,       -- телефон СБП / номер карты — только admin
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text
);

CREATE TABLE IF NOT EXISTS public.hotel_payouts (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id   uuid        NOT NULL REFERENCES public.hotels (id) ON DELETE CASCADE,
    paid_at    date        NOT NULL DEFAULT current_date,
    amount     numeric(12,2) NOT NULL CHECK (amount > 0),
    method     text,       -- СБП / карта / наличные
    comment    text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    deleted_by text
);

CREATE INDEX IF NOT EXISTS hotel_payouts_hotel_idx ON public.hotel_payouts (hotel_id, paid_at DESC);

-- Ручные корректировки — ровно то, что умел backoffice справочника.
CREATE TABLE IF NOT EXISTS public.finance_adjustments (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id   uuid        NOT NULL REFERENCES public.hotels (id) ON DELETE CASCADE,
    reserve_id uuid        REFERENCES public.reserves (id) ON DELETE SET NULL,
    date       date        NOT NULL DEFAULT current_date,
    direction  text        NOT NULL CHECK (direction IN ('we_owe_hotel', 'hotel_owes_us')),
    amount     numeric(12,2) NOT NULL CHECK (amount > 0),
    comment    text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    deleted_by text
);

CREATE INDEX IF NOT EXISTS finance_adjustments_hotel_idx ON public.finance_adjustments (hotel_id, date DESC);
CREATE INDEX IF NOT EXISTS finance_adjustments_reserve_idx ON public.finance_adjustments (reserve_id);

ALTER TABLE public.finance_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_terms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_payment_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_payouts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_adjustments   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_settings_admin_all ON public.finance_settings;
CREATE POLICY finance_settings_admin_all ON public.finance_settings FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
DROP POLICY IF EXISTS hotel_terms_admin_all ON public.hotel_terms;
CREATE POLICY hotel_terms_admin_all ON public.hotel_terms FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
DROP POLICY IF EXISTS hotel_payment_details_admin_all ON public.hotel_payment_details;
CREATE POLICY hotel_payment_details_admin_all ON public.hotel_payment_details FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
DROP POLICY IF EXISTS hotel_payouts_admin_all ON public.hotel_payouts;
CREATE POLICY hotel_payouts_admin_all ON public.hotel_payouts FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
DROP POLICY IF EXISTS finance_adjustments_admin_all ON public.finance_adjustments;
CREATE POLICY finance_adjustments_admin_all ON public.finance_adjustments FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_settings      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_terms           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_payment_details TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_payouts         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_adjustments   TO authenticated;

COMMIT;
