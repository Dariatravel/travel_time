-- Опрос команды по объектам сайта абхазберег.рф (сентябрь 2026, перед
-- поездкой в Абхазию). Временный модуль: две таблицы, обе с RLS.
-- Полное удаление следов: DROP TABLE public.hotel_survey_answers,
-- public.hotel_survey_progress; папки src/features/HotelSurvey,
-- src/app/main/survey, src/app/api/survey; workflow survey-staff-list.yml.
BEGIN;

CREATE TABLE IF NOT EXISTS public.hotel_survey_answers (
    user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    object_slug text        NOT NULL,
    question_id text        NOT NULL,
    answer      jsonb       NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, object_slug, question_id)
);

CREATE TABLE IF NOT EXISTS public.hotel_survey_progress (
    user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    object_slug text        NOT NULL,
    status      text        NOT NULL CHECK (status IN ('done', 'skipped')),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, object_slug)
);

CREATE INDEX IF NOT EXISTS hotel_survey_answers_object_idx
    ON public.hotel_survey_answers (object_slug);

ALTER TABLE public.hotel_survey_answers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_survey_progress ENABLE ROW LEVEL SECURITY;

-- Свои ответы пишут и читают админы и операторы; админ читает всё (статистика).
DROP POLICY IF EXISTS hotel_survey_answers_select ON public.hotel_survey_answers;
DROP POLICY IF EXISTS hotel_survey_answers_write  ON public.hotel_survey_answers;
CREATE POLICY hotel_survey_answers_select
    ON public.hotel_survey_answers FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.current_app_role() = 'admin');
CREATE POLICY hotel_survey_answers_write
    ON public.hotel_survey_answers FOR ALL TO authenticated
    USING (user_id = auth.uid() AND public.current_app_role() IN ('admin', 'operator'))
    WITH CHECK (user_id = auth.uid() AND public.current_app_role() IN ('admin', 'operator'));

DROP POLICY IF EXISTS hotel_survey_progress_select ON public.hotel_survey_progress;
DROP POLICY IF EXISTS hotel_survey_progress_write  ON public.hotel_survey_progress;
CREATE POLICY hotel_survey_progress_select
    ON public.hotel_survey_progress FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.current_app_role() = 'admin');
CREATE POLICY hotel_survey_progress_write
    ON public.hotel_survey_progress FOR ALL TO authenticated
    USING (user_id = auth.uid() AND public.current_app_role() IN ('admin', 'operator'))
    WITH CHECK (user_id = auth.uid() AND public.current_app_role() IN ('admin', 'operator'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_survey_answers  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_survey_progress TO authenticated;

COMMIT;
