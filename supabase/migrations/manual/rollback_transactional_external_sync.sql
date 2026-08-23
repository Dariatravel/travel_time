-- Rollback for 20260818204803_add_transactional_external_sync.sql.
-- Deploy the matching previous application image before applying this rollback.

BEGIN;

DROP FUNCTION IF EXISTS public.sync_external_occupancy(
    text, uuid[], jsonb, boolean, boolean, numeric, boolean
);
DROP FUNCTION IF EXISTS public.sync_external_occupancy(text, uuid[], jsonb);
DROP TABLE IF EXISTS public.sync_runs;

DO $ledger$
BEGIN
    IF to_regclass('app_private.deployment_migrations') IS NOT NULL THEN
        DELETE FROM app_private.deployment_migrations
        WHERE name = 'supabase/migrations/20260818204803_add_transactional_external_sync.sql';
    END IF;
END
$ledger$;

COMMIT;
