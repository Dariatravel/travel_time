-- Кабинет отельера (этап 4, вторая часть, 12.09.2026).
--
-- Отельер (роль hotel, hotels.user_id = auth.uid()) видит по своим отелям:
-- брони с выездом, свою долю, выплаты, корректировки и остаток. Нашу
-- комиссию и модель условий он не видит. Доступ включается по каждому отелю
-- отдельно — hotel_terms.hotelier_visible (по умолчанию выключен): пока Дарья
-- не задала условия и не включила флаг, отельер ничего не видит.
--
-- Данные отдаёт одна функция SECURITY DEFINER с проверкой auth.uid(): так
-- не нужно открывать отельерам таблицы booking_cards/deals (там телефон СБП
-- Дарьи и сделки), а расчёт остаётся в одном месте (lib/finance.ts).
--
-- Откат: DROP FUNCTION public.hotelier_finance_data(date, date);
-- ALTER TABLE public.hotel_terms DROP COLUMN hotelier_visible; папка src/app/main/my-finance.
BEGIN;

ALTER TABLE public.hotel_terms
    ADD COLUMN IF NOT EXISTS hotelier_visible boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.hotelier_finance_data(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_uid  uuid := auth.uid();
    v_result jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('hotels', '[]'::jsonb, 'reserves', '[]'::jsonb, 'terms', '[]'::jsonb,
                                  'payouts', '[]'::jsonb, 'adjustments', '[]'::jsonb, 'accounting_start', NULL);
    END IF;
    SELECT r.role INTO v_role FROM public.user_roles AS r WHERE r.user_id = v_uid;
    IF v_role IS DISTINCT FROM 'hotel' AND v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
    END IF;

    WITH my_hotels AS (
        SELECT h.id, h.title
          FROM public.hotels AS h
          JOIN public.hotel_terms AS t ON t.hotel_id = h.id AND t.hotelier_visible
         WHERE h.user_id = v_uid OR v_role = 'admin'
    )
    SELECT jsonb_build_object(
        'accounting_start', (SELECT s.value FROM public.finance_settings AS s WHERE s.key = 'accounting_start'),
        'hotels', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', mh.id, 'title', mh.title)) FROM my_hotels AS mh), '[]'::jsonb),
        'terms', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'hotel_id', t.hotel_id, 'model', t.model, 'hotel_share_pct', t.hotel_share_pct,
                'fixed_amount', t.fixed_amount, 'prepay_direct_to_hotel', t.prepay_direct_to_hotel,
                'payout_period', t.payout_period, 'min_nights', t.min_nights,
                'deposit_note', t.deposit_note, 'note', NULL))
              FROM public.hotel_terms AS t
             WHERE t.hotel_id IN (SELECT mh.id FROM my_hotels AS mh)), '[]'::jsonb),
        'reserves', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', rs.id, 'guest', rs.guest, 'start', rs.start, 'end', rs.end, 'price', rs.price,
                'prepayment', rs.prepayment, 'external_source', rs.external_source,
                'rooms', jsonb_build_object('id', rm.id, 'title', rm.title,
                                            'hotels', jsonb_build_object('id', mh.id, 'title', mh.title)),
                'booking_cards', CASE WHEN bc.reserve_id IS NULL THEN NULL
                                      ELSE jsonb_build_object('status', bc.status) END,
                'deals', CASE WHEN d.id IS NULL THEN NULL
                              ELSE jsonb_build_object('stage', d.stage, 'pipeline', d.pipeline) END))
              FROM public.reserves AS rs
              JOIN public.rooms AS rm ON rm.id = rs.room_id
              JOIN my_hotels AS mh ON mh.id = rm.hotel_id
              LEFT JOIN public.booking_cards AS bc ON bc.reserve_id = rs.id
              LEFT JOIN LATERAL (SELECT dl.id, dl.stage, dl.pipeline FROM public.deals AS dl
                                  WHERE dl.reserve_id = rs.id ORDER BY dl.updated_at DESC LIMIT 1) AS d ON true
             WHERE rs."end" >= (EXTRACT(EPOCH FROM (p_from::timestamp - interval '1 day')))::bigint
               AND rs."end" <= (EXTRACT(EPOCH FROM (p_to::timestamp + interval '2 day')))::bigint), '[]'::jsonb),
        'payouts', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', p.id, 'hotel_id', p.hotel_id, 'paid_at', p.paid_at,
                                                'amount', p.amount, 'method', p.method, 'comment', p.comment,
                                                'created_by', NULL, 'deleted_at', p.deleted_at))
              FROM public.hotel_payouts AS p
             WHERE p.hotel_id IN (SELECT mh.id FROM my_hotels AS mh) AND p.deleted_at IS NULL
               AND p.paid_at BETWEEN p_from AND p_to), '[]'::jsonb),
        'adjustments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', a.id, 'hotel_id', a.hotel_id, 'reserve_id', a.reserve_id,
                                                'date', a.date, 'direction', a.direction, 'amount', a.amount,
                                                'comment', a.comment, 'created_by', NULL, 'deleted_at', a.deleted_at))
              FROM public.finance_adjustments AS a
             WHERE a.hotel_id IN (SELECT mh.id FROM my_hotels AS mh) AND a.deleted_at IS NULL
               AND a.date BETWEEN p_from AND p_to), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.hotelier_finance_data(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hotelier_finance_data(date, date) TO authenticated;

COMMIT;
