-- Stage 1b: this policy replacement is atomic. Do not split it into individual
-- deployments: permissive RLS policies are combined with OR.
BEGIN;

CREATE POLICY hotels_scoped_by_app_role
    ON public.hotels FOR ALL TO authenticated
    USING (
        public.current_app_role() IN ('admin', 'operator')
        OR auth.uid() = user_id
    )
    WITH CHECK (
        public.current_app_role() IN ('admin', 'operator')
        OR auth.uid() = user_id
    );
DROP POLICY "Admin and operator can view/edit all, hotel can view/edit only " ON public.hotels;

CREATE POLICY rooms_scoped_by_app_role
    ON public.rooms FOR ALL TO authenticated
    USING (
        public.current_app_role() IN ('admin', 'operator')
        OR EXISTS (
            SELECT 1
            FROM public.hotels AS h
            WHERE h.id = rooms.hotel_id AND h.user_id = auth.uid()
        )
    )
    WITH CHECK (
        public.current_app_role() IN ('admin', 'operator')
        OR EXISTS (
            SELECT 1
            FROM public.hotels AS h
            WHERE h.id = rooms.hotel_id AND h.user_id = auth.uid()
        )
    );
DROP POLICY "admin/operator can view/edit all; hotel can view/edit only thei" ON public.rooms;

CREATE POLICY reserves_scoped_by_app_role
    ON public.reserves FOR ALL TO authenticated
    USING (
        public.current_app_role() IN ('admin', 'operator')
        OR EXISTS (
            SELECT 1
            FROM public.rooms AS rm
            JOIN public.hotels AS h ON h.id = rm.hotel_id
            WHERE rm.id = reserves.room_id AND h.user_id = auth.uid()
        )
    )
    WITH CHECK (
        public.current_app_role() IN ('admin', 'operator')
        OR EXISTS (
            SELECT 1
            FROM public.rooms AS rm
            JOIN public.hotels AS h ON h.id = rm.hotel_id
            WHERE rm.id = reserves.room_id AND h.user_id = auth.uid()
        )
    );
DROP POLICY "admin and operator view/edit all; hotel view/edit only their ow" ON public.reserves;

CREATE POLICY room_closures_select_by_app_role
    ON public.room_closures FOR SELECT TO authenticated
    USING (
        public.current_app_role() IN ('admin', 'operator')
        OR EXISTS (
            SELECT 1 FROM public.rooms AS rm
            JOIN public.hotels AS h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id AND h.user_id = auth.uid()
        )
    );
CREATE POLICY room_closures_insert_by_app_role
    ON public.room_closures FOR INSERT TO authenticated
    WITH CHECK (
        public.current_app_role() IN ('admin', 'operator')
        OR EXISTS (
            SELECT 1 FROM public.rooms AS rm
            JOIN public.hotels AS h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id AND h.user_id = auth.uid()
        )
    );
CREATE POLICY room_closures_update_by_app_role
    ON public.room_closures FOR UPDATE TO authenticated
    USING (
        public.current_app_role() IN ('admin', 'operator')
        OR EXISTS (
            SELECT 1 FROM public.rooms AS rm
            JOIN public.hotels AS h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id AND h.user_id = auth.uid()
        )
    )
    WITH CHECK (
        public.current_app_role() IN ('admin', 'operator')
        OR EXISTS (
            SELECT 1 FROM public.rooms AS rm
            JOIN public.hotels AS h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id AND h.user_id = auth.uid()
        )
    );
CREATE POLICY room_closures_delete_by_app_role
    ON public.room_closures FOR DELETE TO authenticated
    USING (
        public.current_app_role() IN ('admin', 'operator')
        OR EXISTS (
            SELECT 1 FROM public.rooms AS rm
            JOIN public.hotels AS h ON h.id = rm.hotel_id
            WHERE rm.id = room_closures.room_id AND h.user_id = auth.uid()
        )
    );
DROP POLICY room_closures_select_scoped ON public.room_closures;
DROP POLICY room_closures_insert_scoped ON public.room_closures;
DROP POLICY room_closures_update_scoped ON public.room_closures;
DROP POLICY room_closures_delete_scoped ON public.room_closures;

CREATE POLICY reserve_deleted_items_select_by_app_role
    ON public.reserve_deleted_items FOR SELECT TO authenticated
    USING (public.current_app_role() IN ('admin', 'operator'));
CREATE POLICY reserve_deleted_items_update_by_app_role
    ON public.reserve_deleted_items FOR UPDATE TO authenticated
    USING (public.current_app_role() IN ('admin', 'operator'))
    WITH CHECK (public.current_app_role() IN ('admin', 'operator'));
CREATE POLICY reserve_deleted_items_delete_by_app_role
    ON public.reserve_deleted_items FOR DELETE TO authenticated
    USING (public.current_app_role() IN ('admin', 'operator'));
CREATE POLICY reserve_deleted_items_insert_by_app_role
    ON public.reserve_deleted_items FOR INSERT TO authenticated
    WITH CHECK (
        public.current_app_role() IN ('admin', 'operator')
        OR auth.uid() = (
            SELECT h.user_id
            FROM public.hotels AS h
            JOIN public.rooms AS rm ON rm.hotel_id = h.id
            WHERE rm.id = app_private.uuid_or_null(reserve_data ->> 'room_id')
            LIMIT 1
        )
        OR auth.uid() = (
            SELECT h.user_id
            FROM public.hotels AS h
            WHERE h.id = COALESCE(
                app_private.uuid_or_null(hotel_data ->> 'id'),
                app_private.uuid_or_null(room_data ->> 'hotel_id')
            )
            LIMIT 1
        )
    );
DROP POLICY reserve_deleted_items_select_staff ON public.reserve_deleted_items;
DROP POLICY reserve_deleted_items_update_staff ON public.reserve_deleted_items;
DROP POLICY reserve_deleted_items_delete_staff ON public.reserve_deleted_items;
DROP POLICY reserve_deleted_items_insert_scoped ON public.reserve_deleted_items;

CREATE POLICY realtycalendar_webhook_events_select_by_app_role
    ON public.realtycalendar_webhook_events FOR SELECT TO authenticated
    USING (public.current_app_role() IN ('admin', 'operator'));
DROP POLICY realtycalendar_webhook_events_staff_select ON public.realtycalendar_webhook_events;

COMMIT;
