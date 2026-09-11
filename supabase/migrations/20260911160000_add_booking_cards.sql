-- Карточка брони (этап 1 единой программы, 11.09.2026).
--
-- Поверх существующей брони (reserves) появляется «карточка сделки» по образцу
-- OKO CRM: источник, ответственный, вид ваучера, реквизиты платежа и отметки
-- о четырёх обязательных действиях после оплаты (ваучер · #бронь в чат ·
-- шахматка · отельеру). Таблица reserves не меняется — только новая таблица
-- со ссылкой на неё. Лента событий — отдельной таблицей, как reserve_history.
--
-- Доступ на старте — только роль admin (правило «новое только за флагом»).
-- Расширение до операторов — отдельной миграцией.
--
-- Полный откат: DROP TABLE public.booking_card_events, public.booking_cards;
-- папки src/features/BookingCard, src/app/main/bookings, src/app/api/booking-card;
-- workflow telegram-send-file.yml; bucket «vouchers» в Storage.
BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_cards (
    reserve_id           uuid        PRIMARY KEY REFERENCES public.reserves (id) ON DELETE CASCADE,
    status               text        NOT NULL DEFAULT 'booked'
                                     CHECK (status IN ('booked', 'changed', 'transferred', 'cancelled')),
    source               text,                     -- Avito / VK / WhatsApp / Telegram / Max
    manager              text,                     -- ответственный, ФИО строкой (как reserves.created_by)
    voucher_kind         text        NOT NULL DEFAULT 'standard'
                                     CHECK (voucher_kind IN ('standard', 'nonrefundable')),
    payment_bank         text,                     -- «Перевод на карту …»
    payment_date         date,
    payment_phone        text,                     -- номер телефона получателя перевода
    service_note         text,                     -- «Услуга закрепления выбранного номера»
    voucher_generated_at timestamptz,
    chat_sent_at         timestamptz,              -- файл с #бронь ушёл в чат
    hotel_notified_at    timestamptz,              -- отельеру отправлено
    client_sent_at       timestamptz,              -- клиенту отправлено
    voucher_path         text,                     -- путь последнего ваучера в Storage
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           text,
    updated_at           timestamptz NOT NULL DEFAULT now(),
    updated_by           text
);

CREATE TABLE IF NOT EXISTS public.booking_card_events (
    id          bigserial   PRIMARY KEY,
    reserve_id  uuid        NOT NULL REFERENCES public.reserves (id) ON DELETE CASCADE,
    event       text        NOT NULL,              -- voucher_generated / chat_sent / hotel_notified / …
    details     jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  text
);

CREATE INDEX IF NOT EXISTS booking_card_events_reserve_idx
    ON public.booking_card_events (reserve_id, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_cards_status_idx
    ON public.booking_cards (status);

ALTER TABLE public.booking_cards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_card_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_cards_admin_all ON public.booking_cards;
CREATE POLICY booking_cards_admin_all
    ON public.booking_cards FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin')
    WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS booking_card_events_admin_all ON public.booking_card_events;
CREATE POLICY booking_card_events_admin_all
    ON public.booking_card_events FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin')
    WITH CHECK (public.current_app_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_cards       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_card_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.booking_card_events_id_seq  TO authenticated;

COMMIT;
