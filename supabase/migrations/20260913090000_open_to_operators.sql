-- Открыть операторам разделы единой программы (после проверки Дарьей):
-- карточку брони, «Утро менеджера», клиентов и сделки. Финансы остаются
-- только у admin.
--
-- Политики заменяются атомарно в одной транзакции (permissive-политики
-- складываются через OR — старые admin-only снимаем, ставим admin+operator).
-- Откат: вернуть политики *_admin_all из миграций 20260911160000,
-- 20260912090000 и 20260912120000.
BEGIN;

-- Карточка брони и лента
DROP POLICY IF EXISTS booking_cards_admin_all ON public.booking_cards;
DROP POLICY IF EXISTS booking_cards_staff_all ON public.booking_cards;
CREATE POLICY booking_cards_staff_all ON public.booking_cards FOR ALL TO authenticated
    USING (public.current_app_role() IN ('admin', 'operator'))
    WITH CHECK (public.current_app_role() IN ('admin', 'operator'));

DROP POLICY IF EXISTS booking_card_events_admin_all ON public.booking_card_events;
DROP POLICY IF EXISTS booking_card_events_staff_all ON public.booking_card_events;
CREATE POLICY booking_card_events_staff_all ON public.booking_card_events FOR ALL TO authenticated
    USING (public.current_app_role() IN ('admin', 'operator'))
    WITH CHECK (public.current_app_role() IN ('admin', 'operator'));

-- Утро менеджера
DROP POLICY IF EXISTS guest_touchpoints_admin_all ON public.guest_touchpoints;
DROP POLICY IF EXISTS guest_touchpoints_staff_all ON public.guest_touchpoints;
CREATE POLICY guest_touchpoints_staff_all ON public.guest_touchpoints FOR ALL TO authenticated
    USING (public.current_app_role() IN ('admin', 'operator'))
    WITH CHECK (public.current_app_role() IN ('admin', 'operator'));

-- Тексты гостям: операторы читают, правит только admin.
DROP POLICY IF EXISTS message_templates_admin_all ON public.message_templates;
DROP POLICY IF EXISTS message_templates_staff_select ON public.message_templates;
DROP POLICY IF EXISTS message_templates_admin_write ON public.message_templates;
CREATE POLICY message_templates_staff_select ON public.message_templates FOR SELECT TO authenticated
    USING (public.current_app_role() IN ('admin', 'operator'));
CREATE POLICY message_templates_admin_write ON public.message_templates FOR ALL TO authenticated
    USING (public.current_app_role() = 'admin')
    WITH CHECK (public.current_app_role() = 'admin');

-- Клиенты и сделки
DROP POLICY IF EXISTS clients_admin_all ON public.clients;
DROP POLICY IF EXISTS clients_staff_all ON public.clients;
CREATE POLICY clients_staff_all ON public.clients FOR ALL TO authenticated
    USING (public.current_app_role() IN ('admin', 'operator'))
    WITH CHECK (public.current_app_role() IN ('admin', 'operator'));

DROP POLICY IF EXISTS deals_admin_all ON public.deals;
DROP POLICY IF EXISTS deals_staff_all ON public.deals;
CREATE POLICY deals_staff_all ON public.deals FOR ALL TO authenticated
    USING (public.current_app_role() IN ('admin', 'operator'))
    WITH CHECK (public.current_app_role() IN ('admin', 'operator'));

DROP POLICY IF EXISTS deal_messages_admin_all ON public.deal_messages;
DROP POLICY IF EXISTS deal_messages_staff_all ON public.deal_messages;
CREATE POLICY deal_messages_staff_all ON public.deal_messages FOR ALL TO authenticated
    USING (public.current_app_role() IN ('admin', 'operator'))
    WITH CHECK (public.current_app_role() IN ('admin', 'operator'));

COMMIT;
