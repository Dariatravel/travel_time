DROP FUNCTION IF EXISTS public.get_sync_freshness_snapshot(numeric, numeric, jsonb, text[]);
DROP TABLE IF EXISTS public.sync_alert_states;

-- Без этого повторная выкатка решит, что миграция уже применена, и пропустит её:
-- реестр ведёт scripts/apply-release-migrations.sh. Таблицы может не быть, если
-- откат выполняют на базе, куда деплой ещё не приходил, — поэтому через to_regclass.
DO $ledger$
BEGIN
    IF to_regclass('app_private.deployment_migrations') IS NOT NULL THEN
        DELETE FROM app_private.deployment_migrations
        WHERE name = 'supabase/migrations/20260824090000_add_sync_freshness_alerts.sql';
    END IF;
END
$ledger$;
