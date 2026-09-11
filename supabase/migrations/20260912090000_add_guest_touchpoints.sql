-- «Утро менеджера» (этап 2 единой программы, 12.09.2026).
--
-- Переносит в шахматку панель напоминаний Иры (reminder-dashboard):
-- касания гостя — напоминание перед заездом, просьба об отзыве, проверка
-- отзыва — и их статусы, которые раньше жили в листе «ИСТОРИЯ ДЕЙСТВИЙ»
-- Google-таблицы. Сами задачи не материализуются: они считаются на лету из
-- reserves, а здесь хранится только то, что менеджер отметил.
--
-- Тексты сообщений гостям — справочник message_templates, редактируется в UI.
--
-- Доступ на старте — только admin (правило «новое только за флагом»).
-- Полный откат: DROP TABLE public.guest_touchpoints, public.message_templates;
-- папки src/features/Morning, src/app/main/morning.
BEGIN;

CREATE TABLE IF NOT EXISTS public.guest_touchpoints (
    reserve_id   uuid        NOT NULL REFERENCES public.reserves (id) ON DELETE CASCADE,
    kind         text        NOT NULL CHECK (kind IN ('reminder', 'review_request', 'review_check')),
    status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'done', 'postponed', 'not_arrived',
                                               'cancelled', 'review_found', 'review_later', 'checked')),
    snooze_until date,                        -- «завтра» = +1 день, «обещали позже» = +3 дня
    channel      text,                        -- avito / telegram / vk / max / whatsapp
    done_at      timestamptz,
    done_by      text,                        -- ФИО строкой, как reserves.created_by
    note         text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (reserve_id, kind)
);

CREATE INDEX IF NOT EXISTS guest_touchpoints_open_idx
    ON public.guest_touchpoints (status, snooze_until)
    WHERE status IN ('pending', 'postponed', 'review_later');

CREATE TABLE IF NOT EXISTS public.message_templates (
    key        text        PRIMARY KEY,
    title      text        NOT NULL,
    body       text        NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text
);

-- Черновики текстов: Дарья и Ира правят их прямо на экране «Утро».
INSERT INTO public.message_templates (key, title, body) VALUES
    ('arrival_reminder', 'Напоминание о заезде (за 3 дня)',
     E'Здравствуйте, {имя}! Напоминаю о вашем заезде {заезд} в {отель} 🌊\nЗаезд с 14:00, выезд до 12:00. Контакты отеля указаны в ваучере — напишите отелю накануне, чтобы вас встретили.\nЕсли планы изменились, дайте, пожалуйста, знать заранее. Хорошей дороги! 🙏'),
    ('review_request', 'Просьба об отзыве (через 7 дней после выезда)',
     E'Здравствуйте, {имя}! Надеюсь, отдых в {отель} прошёл хорошо 🤍\nБуду очень благодарна за отзыв об отеле и о нашей работе: на Яндекс-картах, в группе ВК или на Авито. Это помогает другим гостям выбрать проверенное жильё.\nСпасибо! 🙏')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.guest_touchpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guest_touchpoints_admin_all ON public.guest_touchpoints;
CREATE POLICY guest_touchpoints_admin_all
    ON public.guest_touchpoints FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin')
    WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS message_templates_admin_all ON public.message_templates;
CREATE POLICY message_templates_admin_all
    ON public.message_templates FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin')
    WITH CHECK (public.current_app_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_touchpoints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;

COMMIT;
