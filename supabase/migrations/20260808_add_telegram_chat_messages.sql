-- Сообщения из чата отельеров: их присылает бот (см. scripts/telegram-collect.mjs).
-- Нужны, чтобы «окошки», о которых отельеры пишут словами, попадали в подборки
-- без ручных скриншотов. Пишет и читает только сервисная роль (крон/отчёты).

CREATE TABLE IF NOT EXISTS public.telegram_chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id bigint NOT NULL,
    chat_title text,
    chat_type text,
    message_id bigint NOT NULL,
    update_id bigint NOT NULL,
    author_id bigint,
    author_name text,
    author_username text,
    text text,
    sent_at timestamptz,
    edited_at timestamptz,
    collected_at timestamptz NOT NULL DEFAULT now(),
    -- Заполняется позже: к какому нашему объекту относится сообщение.
    hotel_id uuid REFERENCES public.hotels(id) ON DELETE SET NULL,
    raw jsonb,
    UNIQUE (chat_id, message_id)
);

CREATE INDEX IF NOT EXISTS telegram_chat_messages_sent_at_idx
    ON public.telegram_chat_messages (sent_at DESC);

CREATE INDEX IF NOT EXISTS telegram_chat_messages_chat_id_idx
    ON public.telegram_chat_messages (chat_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS telegram_chat_messages_hotel_id_idx
    ON public.telegram_chat_messages (hotel_id);

ALTER TABLE public.telegram_chat_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.telegram_chat_messages FROM anon, authenticated;
